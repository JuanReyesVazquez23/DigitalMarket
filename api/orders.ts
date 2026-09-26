// GET /api/orders — registro completo con quién compró (solo rol admin).
// POST /api/orders — compra del carrito (requiere login). Transacción: valida stock,
// crea pedido y descuenta inventario. Agrupa líneas duplicadas (anti-oversell).
import crypto from "node:crypto";
import { getPool } from "./_db.js";
import { getAuthUser, send } from "./_auth.js";
import type { DbRow, Handler } from "./_types.js";

interface OrderLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}

/** Zonas espejo de ts/services/shipping.ts. */
const FREE_SHIPPING_OVER = 20000;

function normalizeZone(zoneId: unknown): string {
  const z = String(zoneId ?? "").trim().toLowerCase();
  if (z === "interior" || z === "pickup") return z;
  return "santo-domingo";
}

function zoneCost(zone: string): number {
  if (zone === "interior") return 450;
  if (zone === "pickup") return 0;
  return 250;
}

const handler: Handler = async (req, res) => {
  if (req.method === "GET") {
    const admin = getAuthUser(req);
    if (!admin) return send(res, 401, { message: "No autorizado." });
    if (admin.role !== "admin") return send(res, 403, { message: "Solo administradores." });
    const pool = getPool();
    const { rows: orders } = await pool.query(
      `SELECT "Id","UserId","Username","Total","ShippingZone","ShippingCost","CreatedAtUtc" FROM "Orders" ORDER BY "CreatedAtUtc" DESC`
    );
    const out = [];
    for (const o of orders) {
      const { rows: items } = await pool.query(
        `SELECT "ProductName","UnitPrice","Quantity" FROM "OrderItems" WHERE "OrderId"=$1`,
        [String(o.Id)]
      );
      out.push({
        id: String(o.Id),
        userId: String(o.UserId),
        username: String(o.Username),
        total: Number(o.Total ?? 0),
        shippingZone: String(o.ShippingZone ?? "santo-domingo"),
        shippingCost: Number(o.ShippingCost ?? 0),
        createdAtUtc: o.CreatedAtUtc instanceof Date ? o.CreatedAtUtc.toISOString() : String(o.CreatedAtUtc ?? ""),
        items: items.map((i: DbRow) => ({
          productName: String(i.ProductName ?? ""),
          quantity: Number(i.Quantity ?? 0),
          unitPrice: Number(i.UnitPrice ?? 0),
        })),
      });
    }
    return send(res, 200, out);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { message: "Método no permitido." });
  }
  const user = getAuthUser(req);
  if (!user) return send(res, 401, { message: "No autorizado." });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const items = (body.items ?? body.Items ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(items) || items.length === 0) {
    return send(res, 400, { message: "El carrito está vacío." });
  }
  const zone = normalizeZone(body.zoneId ?? body.ZoneId);
  // Agrupa por producto antes de validar stock.
  const grouped = new Map<string, number>();
  for (const it of items) {
    const rec = it as Record<string, unknown>;
    const pid = String(rec.productId ?? rec.ProductId ?? "");
    const q = Number(rec.quantity ?? rec.Quantity ?? 0);
    if (!pid || !Number.isInteger(q) || q < 1 || q > 99) {
      return send(res, 400, { message: "Cantidad inválida para un producto." });
    }
    grouped.set(pid, (grouped.get(pid) || 0) + q);
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lines: OrderLine[] = [];
    for (const [pid, qty] of grouped) {
      const { rows } = await client.query(
        `SELECT "Id","Name","Price","Stock" FROM "Products" WHERE "Id"=$1 FOR UPDATE`,
        [pid]
      );
      const p: DbRow | undefined = rows[0];
      if (!p) {
        await client.query("ROLLBACK");
        return send(res, 400, { message: "Un producto del carrito ya no existe." });
      }
      if (Number(p.Stock) < qty) {
        await client.query("ROLLBACK");
        return send(res, 400, { message: `Sin stock suficiente de "${String(p.Name)}" (quedan ${Number(p.Stock)}).` });
      }
      lines.push({ productId: String(p.Id), productName: String(p.Name), unitPrice: Number(p.Price), quantity: qty });
      await client.query(`UPDATE "Products" SET "Stock"="Stock"-$1 WHERE "Id"=$2`, [qty, pid]);
    }
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);
    const shipping = subtotal >= FREE_SHIPPING_OVER ? 0 : zoneCost(zone);
    const total = subtotal + shipping;
    const orderId = crypto.randomUUID();
    await client.query(
      `INSERT INTO "Orders"("Id","UserId","Username","Total","ShippingZone","ShippingCost","CreatedAtUtc") VALUES ($1,$2,$3,$4,$5,$6,now())`,
      [orderId, user.id, user.username, total, zone, shipping]
    );
    for (const l of lines) {
      await client.query(
        `INSERT INTO "OrderItems"("Id","OrderId","ProductId","ProductName","UnitPrice","Quantity")
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5)`,
        [orderId, l.productId, l.productName, l.unitPrice, l.quantity]
      );
    }
    await client.query("COMMIT");
    return send(res, 201, { id: orderId, total, shippingZone: zone, shippingCost: shipping, items: lines });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ya en error */
    }
    throw e;
  } finally {
    client.release();
  }
};

export default handler;
