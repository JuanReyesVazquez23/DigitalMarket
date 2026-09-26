// Layer: ts/data/order-repository — compra (requiere JWT, con refresh automático).
import type { CheckoutLine } from "../domain/auth.js";
import type { Product } from "../domain/models.js";
import { api } from "../services/api-config.js";
import { authFetch } from "./auth-fetch.js";

const API = api("/api/orders");

export interface PlacedOrder {
  id: string;
  total: number;
  shippingZone: string;
  shippingCost: number;
  items: { productName: string; quantity: number; unitPrice: number }[];
}

export interface PlacedOrderFull extends PlacedOrder {
  createdAtUtc: string;
}

export interface AdminOrder extends PlacedOrderFull {
  userId: string;
  username: string;
}

export async function adminOrders(): Promise<AdminOrder[]> {
  const res = await authFetch(API);
  if (res.status === 403) throw new Error("FORBIDDEN");
  if (!res.ok) throw new Error("No se pudo cargar el registro.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (await res.json()) as any[];
  return arr.map((o) => ({
    id: String(o.id ?? o.Id ?? ""),
    userId: String(o.userId ?? o.UserId ?? ""),
    username: String(o.username ?? o.Username ?? ""),
    total: Number(o.total ?? o.Total ?? 0),
    shippingZone: String(o.shippingZone ?? o.ShippingZone ?? ""),
    shippingCost: Number(o.shippingCost ?? o.ShippingCost ?? 0),
    createdAtUtc: String(o.createdAtUtc ?? o.CreatedAtUtc ?? ""),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (((o.items ?? o.Items ?? []) as any[]).map((i) => ({
      productName: String(i.productName ?? i.ProductName ?? ""),
      quantity: Number(i.quantity ?? i.Quantity ?? 0),
      unitPrice: Number(i.unitPrice ?? i.UnitPrice ?? 0),
    }))),
  }));
}

export async function checkout(lines: CheckoutLine[], zoneId: string): Promise<PlacedOrder> {
  const res = await authFetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: lines, zoneId }),
  });
  if (!res.ok) {
    let msg = "No se pudo completar la compra.";
    try {
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = (data as any).message;
      if (typeof m === "string" && m !== "") msg = m;
    } catch { /* usa el fallback */ }
    throw new Error(msg);
  }
  const o = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((o.items ?? o.Items ?? []) as any[]).map((i) => ({
    productName: String(i.productName ?? i.ProductName ?? ""),
    quantity: Number(i.quantity ?? i.Quantity ?? 0),
    unitPrice: Number(i.unitPrice ?? i.UnitPrice ?? 0),
  }));
  return {
    id: String(o.id ?? o.Id ?? ""),
    total: Number(o.total ?? o.Total ?? 0),
    shippingZone: String(o.shippingZone ?? o.ShippingZone ?? ""),
    shippingCost: Number(o.shippingCost ?? o.ShippingCost ?? 0),
    items,
  };
}

export function orderLinesFor(
  cart: { id: string; qty: number }[],
  catalog: Product[]
): CheckoutLine[] {
  return cart
    .filter((l) => catalog.some((p) => p.id === l.id))
    .map((l) => ({ productId: l.id, quantity: l.qty }));
}

export async function mine(): Promise<PlacedOrderFull[]> {
  const res = await authFetch(`${API}/mine`);
  if (!res.ok) throw new Error("No se pudo cargar el historial.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (await res.json()) as any[];
  return arr.map((o) => ({
    id: String(o.id ?? o.Id ?? ""),
    total: Number(o.total ?? o.Total ?? 0),
    shippingZone: String(o.shippingZone ?? o.ShippingZone ?? ""),
    shippingCost: Number(o.shippingCost ?? o.ShippingCost ?? 0),
    createdAtUtc: String(o.createdAtUtc ?? o.CreatedAtUtc ?? ""),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (((o.items ?? o.Items ?? []) as any[]).map((i) => ({
      productName: String(i.productName ?? i.ProductName ?? ""),
      quantity: Number(i.quantity ?? i.Quantity ?? 0),
      unitPrice: Number(i.unitPrice ?? i.UnitPrice ?? 0),
    }))),
  }));
}
