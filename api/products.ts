// GET /api/products?limit=&offset=&category=&q=&includeHidden= (público, cacheable en CDN)
// POST /api/products (requiere login)
import { getPool } from "./_db.js";
import { categoryToInt, categoryToName, getAuthUser, isAdminUser, send } from "./_auth.js";
import type { DbRow, Handler, VercelReq } from "./_types.js";

function mapRow(r: DbRow): Record<string, unknown> {
  return {
    id: String(r.Id ?? ""),
    name: String(r.Name ?? ""),
    price: Number(r.Price ?? 0),
    category: categoryToName(r.Category),
    imageUrl: String(r.ImageUrl ?? ""),
    description: String(r.Description ?? ""),
    stock: Number(r.Stock ?? 0),
    hidden: Boolean(r.Hidden ?? false),
  };
}

function validate(dto: Record<string, unknown>): string | null {
  const name = String(dto.name ?? dto.Name ?? "").trim();
  if (name.length < 2) return "El nombre debe tener al menos 2 caracteres.";
  const price = Number(dto.price ?? dto.Price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return "El precio debe ser mayor a 0.";
  const stock = Number(dto.stock ?? dto.Stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) return "El stock no puede ser negativo.";
  return null;
}

/** Filtros compartidos: devuelve {where, params} con placeholders $n.
 * Búsqueda tolerante: cada palabra (sin tildes vía unaccent) debe aparecer
 * en nombre o descripción, en cualquier orden. */
function filters(
  q: Record<string, string | string[] | undefined>,
  startAt: number
): { where: string; params: unknown[]; next: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  let i = startAt;
  const cat = String(q.category ?? "").trim();
  if (cat !== "") {
    const idx = ["Consolas", "Videojuegos", "Accesorios", "PC", "Monitores"].indexOf(cat);
    if (idx !== -1) {
      params.push(idx);
      where.push(`"Category"=$${i++}`);
    }
  }
  const tokens = String(q.q ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t !== "");
  for (const t of tokens) {
    params.push(`%${t}%`);
    where.push(`(unaccent("Name") ILIKE unaccent($${i}) OR unaccent("Description") ILIKE unaccent($${i}))`);
    i++;
  }
  if (String(q.includeHidden ?? "") !== "true") {
    where.push(`"Hidden"=FALSE`);
  }
  return { where: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "", params, next: i };
}

function queryOf(req: VercelReq): Record<string, string | string[] | undefined> {
  return req.query ?? {};
}

const handler: Handler = async (req, res) => {
  const pool = getPool();
  const q = queryOf(req);

  if (req.method === "GET") {
    // Why caché CDN: catálogo público e igual para todos; cada querystring se
    // cachea 60s en el edge con revalidación de fondo.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 12));
    const offset = Math.max(0, Number(q.offset) || 0);
    const { where, params, next } = filters(q, 1);
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM "Products" ${where}`, params);
    const total = Number(countRes.rows[0]?.total ?? 0);
    const { rows } = await pool.query(
      `SELECT "Id","Name","Price","Category","ImageUrl","Description","Stock","Hidden" FROM "Products" ${where} ORDER BY "Name" LIMIT $${next} OFFSET $${next + 1}`,
      [...params, limit, offset]
    );
    return send(res, 200, { items: rows.map(mapRow), total, limit, offset });
  }

  if (req.method === "POST") {
    if (!getAuthUser(req)) return send(res, 401, { message: "No autorizado." });
    if (!isAdminUser(req)) return send(res, 403, { message: "Solo el administrador." });
    const dto = (req.body ?? {}) as Record<string, unknown>;
    const err = validate(dto);
    if (err) return send(res, 400, { message: err });
    let category: number;
    try {
      category = categoryToInt(dto.category ?? dto.Category ?? "Accesorios");
    } catch (e) {
      return send(res, 400, { message: (e as Error).message });
    }
    const name = String(dto.name ?? dto.Name ?? "").trim();
    const imageUrl =
      String(dto.imageUrl ?? dto.ImageUrl ?? "").trim() ||
      `https://placehold.co/600x400/111111/E10600?text=${encodeURIComponent(name)}`;
    const { rows } = await pool.query(
      `INSERT INTO "Products"("Id","Name","Price","Category","ImageUrl","Description","Stock","Hidden")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)
       RETURNING "Id","Name","Price","Category","ImageUrl","Description","Stock","Hidden"`,
      [
        name,
        Number(dto.price ?? dto.Price),
        category,
        imageUrl,
        String(dto.description ?? dto.Description ?? "").trim(),
        Number(dto.stock ?? dto.Stock ?? 0),
        Boolean(dto.hidden ?? dto.Hidden ?? false),
      ]
    );
    const created = rows[0];
    if (!created) return send(res, 500, { message: "No se pudo crear." });
    return send(res, 201, mapRow(created));
  }

  res.setHeader("Allow", "GET, POST");
  return send(res, 405, { message: "Método no permitido." });
};

export default handler;
