// Layer: ts/data — acceso a datos (API ASP.NET + respaldo localStorage).
import type { CreateProductDto, PagedResult, Product } from "../domain/models.js";
import { api } from "../services/api-config.js";
import { matchesProduct } from "../services/product-service.js";
import { authFetch } from "./auth-fetch.js";

const API = api("/api/products");
const API_ALL = api("/api/products/all");
const LS_KEY = "dg_products_v1";

function readLocal(): Product[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Product[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(items: Product[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento lleno/bloqueado: MVP continúa solo con API */
  }
}

export async function fetchProducts(): Promise<Product[]> {
  try {
    const res = await fetch(API_ALL);
    if (res.status === 403) throw new Error("FORBIDDEN");
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = (await res.json()) as Product[];
    // Normaliza C# (PascalCase) -> TS (camelCase) por si el backend serializa así.
    const normalized = data.map(normalize);
    if (normalized.length > 0) {
      // Why merge y no overwrite: los productos creados sin conexión viven solo
      // en localStorage; antes se borraban del caché (y de la vista) en el próximo fetch.
      const previous = readLocal();
      const localOnly = previous.filter((l) => !normalized.some((n) => n.id === l.id));
      writeLocal([...localOnly, ...normalized]);
    }
    return readLocal();
  } catch {
    return readLocal();
  }
}

export interface PageQuery {
  limit: number;
  offset: number;
  category?: string;
  query?: string;
  includeHidden?: boolean;
}

/**
 * Pide una ventana del catálogo (desplazamiento). El CDN cachea cada URL.
 * Sin conexión, pagina la caché local con la misma forma.
 */
export async function fetchPage(q: PageQuery): Promise<PagedResult<Product>> {
  const params = new URLSearchParams({
    limit: String(q.limit),
    offset: String(q.offset),
  });
  if (q.category && q.category !== "all") params.set("category", q.category);
  if (q.query && q.query.trim() !== "") params.set("q", q.query.trim());
  if (q.includeHidden) params.set("includeHidden", "true");

  try {
    const res = await fetch(`${API}?${params.toString()}`);
    if (res.status === 403) throw new Error("FORBIDDEN");
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const items = ((data.items ?? data.Items ?? []) as Product[]).map(normalize);
    return {
      items,
      total: Number(data.total ?? data.Total ?? items.length),
      limit: Number(data.limit ?? data.Limit ?? q.limit),
      offset: Number(data.offset ?? data.Offset ?? q.offset),
    };
  } catch {
    // Fallback offline: misma forma paginando la caché local (misma búsqueda tolerante).
    const filtered = readLocal().filter(
      (p) => (q.includeHidden || !p.hidden) && matchesProduct(p, q.category ?? "all", q.query ?? "")
    );
    return {
      items: filtered.slice(q.offset, q.offset + q.limit),
      total: filtered.length,
      limit: q.limit,
      offset: q.offset,
    };
  }
}

export interface SaveResult {
  product: Product;
  /** True si quedó en el servidor; false si solo en este navegador (sin conexión). */
  remote: boolean;
}

export async function createProduct(dto: CreateProductDto): Promise<SaveResult> {
  const fallback: Product = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: dto.name,
    price: dto.price,
    category: dto.category,
    imageUrl: dto.imageUrl,
    description: dto.description,
    stock: dto.stock,
    hidden: dto.hidden,
  };
  try {
    // Why authFetch: si el access venció rota solo y reintenta; NO_AUTH avisa login.
    const res = await authFetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    if (res.status === 403) throw new Error("FORBIDDEN");
    if (!res.ok) throw new Error(`API ${res.status}`);
    const created = normalize(await res.json());
    writeLocal([created, ...readLocal()]);
    return { product: created, remote: true };
  } catch (e) {
    // Why: sin login (401) no se inventa un producto local: el admin debe ver el
    // aviso de sesión en vez de creer que guardó en el servidor.
    if (e instanceof Error && e.message === "NO_AUTH") throw e;
    writeLocal([fallback, ...readLocal()]);
    return { product: fallback, remote: false };
  }
}

export async function updateProduct(id: string, dto: CreateProductDto): Promise<SaveResult> {
  try {
    const res = await authFetch(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    if (res.status === 403) throw new Error("FORBIDDEN");
    if (!res.ok) throw new Error(`API ${res.status}`);
    const updated = normalize(await res.json());
    writeLocal(readLocal().map((p) => (p.id === id ? updated : p)));
    return { product: updated, remote: true };
  } catch (e) {
    if (e instanceof Error && e.message === "NO_AUTH") throw e;
    // Sin conexión: upsert local para no perder la edición.
    const current = readLocal();
    const edited: Product = {
      id,
      name: dto.name,
      price: dto.price,
      category: dto.category,
      imageUrl: dto.imageUrl,
      description: dto.description,
      stock: dto.stock,
      hidden: dto.hidden,
    };
    const exists = current.some((p) => p.id === id);
    writeLocal(exists ? current.map((p) => (p.id === id ? edited : p)) : [edited, ...current]);
    return { product: edited, remote: false };
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const removeLocal = (): void => writeLocal(readLocal().filter((p) => p.id !== id));
  try {
    await authFetch(`${API}/${id}`, { method: "DELETE" });
    removeLocal();
  } catch (e) {
    if (e instanceof Error && e.message === "NO_AUTH") throw e;
    removeLocal(); // Sin conexión: al menos se borra en local.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(p: any): Product {
  return {
    id: String(p.id ?? p.Id ?? crypto.randomUUID()),
    name: String(p.name ?? p.Name ?? "Sin nombre"),
    price: Number(p.price ?? p.Price ?? 0),
    category: mapCategory(p.category ?? p.Category ?? "Accesorios"),
    imageUrl: String(p.imageUrl ?? p.ImageUrl ?? ""),
    description: String(p.description ?? p.Description ?? ""),
    stock: Number(p.stock ?? p.Stock ?? 0),
    hidden: Boolean(p.hidden ?? p.Hidden ?? false),
  };
}

// Why: C# serializa Category como número (0-4) o string; el filtro usa nombres.
function mapCategory(raw: unknown): string {
  const names = ["Consolas", "Videojuegos", "Accesorios", "PC", "Monitores"];
  if (typeof raw === "number" && names[raw] !== undefined) return names[raw];
  const s = String(raw);
  const asNum = Number(s);
  if (Number.isInteger(asNum) && names[asNum] !== undefined) return names[asNum];
  return s;
}

