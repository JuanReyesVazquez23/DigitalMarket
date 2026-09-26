// PUT /api/products/:id · DELETE /api/products/:id (requieren login)
import { del } from "@vercel/blob";
import { getPool } from "../_db.js";
import { categoryToInt, categoryToName, getAuthUser, isAdminUser, send } from "../_auth.js";
import type { DbRow, Handler } from "../_types.js";

/** Borra el blob viejo sin romper nada si no es blob o falla. */
async function dropBlob(url: unknown): Promise<void> {
  if (typeof url !== "string") return;
  if (!url.includes("blob.vercel-storage.com") && !url.includes("public.blob.vercel-storage.com")) return;
  try {
    await del(url);
  } catch {
    /* best-effort */
  }
}

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

const handler: Handler = async (req, res) => {
  if (!getAuthUser(req)) return send(res, 401, { message: "No autorizado." });
  if (!isAdminUser(req)) return send(res, 403, { message: "Solo el administrador." });
  const pool = getPool();
  const id = req.query.id;

  if (req.method === "PUT") {
    const dto = (req.body ?? {}) as Record<string, unknown>;
    const name = String(dto.name ?? dto.Name ?? "").trim();
    if (name.length < 2) return send(res, 400, { message: "El nombre debe tener al menos 2 caracteres." });
    const price = Number(dto.price ?? dto.Price ?? 0);
    if (!Number.isFinite(price) || price <= 0) return send(res, 400, { message: "El precio debe ser mayor a 0." });
    let category: number;
    try {
      category = categoryToInt(dto.category ?? dto.Category ?? "Accesorios");
    } catch (e) {
      return send(res, 400, { message: (e as Error).message });
    }
    const imageUrl =
      String(dto.imageUrl ?? dto.ImageUrl ?? "").trim() ||
      `https://placehold.co/600x400/111111/E10600?text=${encodeURIComponent(name)}`;
    const prev = await pool.query(`SELECT "ImageUrl" FROM "Products" WHERE "Id"=$1`, [id]);
    const { rows } = await pool.query(
      `UPDATE "Products" SET "Name"=$1,"Price"=$2,"Category"=$3,"ImageUrl"=$4,"Description"=$5,"Stock"=$6,"Hidden"=$7
       WHERE "Id"=$8
       RETURNING "Id","Name","Price","Category","ImageUrl","Description","Stock","Hidden"`,
      [
        name,
        price,
        category,
        imageUrl,
        String(dto.description ?? dto.Description ?? "").trim(),
        Math.max(0, Number(dto.stock ?? dto.Stock ?? 0)),
        Boolean(dto.hidden ?? dto.Hidden ?? false),
        id,
      ]
    );
    if (rows.length === 0) return send(res, 404, { message: "No encontrado." });
    const r = rows[0] as DbRow;
    const prevImage = prev.rows[0]?.ImageUrl;
    if (prevImage !== r.ImageUrl) await dropBlob(prevImage);
    return send(res, 200, mapRow(r));
  }

  if (req.method === "DELETE") {
    const prev = await pool.query(`SELECT "ImageUrl" FROM "Products" WHERE "Id"=$1`, [id]);
    const { rowCount } = await pool.query(`DELETE FROM "Products" WHERE "Id"=$1`, [id]);
    if (rowCount === 0) return send(res, 404, { message: "No encontrado." });
    if (prev.rows[0]) await dropBlob(prev.rows[0].ImageUrl);
    return res.status(204).end();
  }

  res.setHeader("Allow", "PUT, DELETE");
  return send(res, 405, { message: "Método no permitido." });
};

export default handler;
