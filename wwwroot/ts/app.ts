// Layer: ts/app — composición (entry point). Une domain/data/services/ui.
import { fetchPage, fetchProducts } from "./data/product-repository.js";
import { adminOrders } from "./data/order-repository.js";
import { adminStatus } from "./data/auth-repository.js";
import { addToCart, getCart } from "./services/cart-store.js";
import { getSession } from "./services/session-store.js";
import { renderStore } from "./ui/store-renderer.js";
import { setupAdmin } from "./ui/admin-controller.js";
import { setupAuth } from "./ui/auth-controller.js";
import { setupCart, toast } from "./ui/cart-drawer.js";
import { setupCountdown } from "./ui/countdown.js";
import { setupDetail } from "./ui/product-detail.js";
import { setupOrders } from "./ui/orders-controller.js";
import { setupTapUnlock } from "./ui/tap-unlock.js";
import type { PagedResult, Product } from "./domain/models.js";

const grid = el("grid");
const empty = el("emptyState");
const count = el("countLabel");
const pageLabel = el("pageLabel");
const prevBtn = el("prevPage") as HTMLButtonElement;
const nextBtn = el("nextPage") as HTMLButtonElement;
const statTotal = document.getElementById("statTotal");
const search = el("searchInput") as HTMLInputElement;
const filters = el("filters");
const brandTitle = el("brandTitle");
const tapHint = el("tapHint");
const adminPanel = el("adminPanel");

let all: Product[] = [];
let activeCat = "all";
// Why: GTA VI (y futuros ocultos) no salen en el catálogo general;
// solo aparecen al entrar por el botón Reservar.
let showHidden = false;
// Paginación por desplazamiento (el CDN cachea cada ventana).
const PAGE_SIZE = 8;
let page = 1;
let pageResult: PagedResult<Product> = { items: [], total: 0, limit: PAGE_SIZE, offset: 0 };

const auth = setupAuth({
  onSessionChanged: () => {
    cart.renderCart();
    void reload();
    if (getSession()) {
      // Why: si entró para comprar, le devuelvo el carrito para cerrar la compra.
      if (getCart().length > 0) cart.openCart();
    } else {
      // Why: sin sesión el admin no puede guardar (401); se bloquea para no confundir.
      admin.lock();
    }
  },
});

const cart = setupCart({
  getCatalog: () => all,
  onCheckoutDone: reload,
  requireAuth: (notice) => auth.openAuth("login", notice),
  onCartChanged: paint,
  refreshCatalog: reload,
});

const detail = setupDetail({
  getCatalog: () => all,
  onAdd: (id, qty) => {
    const p = all.find((x) => x.id === id);
    if (!p) return;
    const inCart = getCart().find((l) => l.id === id)?.qty ?? 0;
    const addable = Math.max(0, Math.min(qty, p.stock - inCart));
    if (addable <= 0) {
      toast(p.stock <= 0 ? "Agotado por ahora." : "Ya tienes el máximo en el carrito.");
      return;
    }
    for (let i = 0; i < addable; i++) addToCart(id);
    cart.renderCart();
    paint();
    toast(`Agregado: ${p.name} ×${addable} 🛒`);
  },
});

setupOrders({
  requireAuth: (notice) => auth.openAuth("login", notice),
});

const admin = setupAdmin({
  onChanged: reload,
  onLock: () => tapLock.lock(),
});

const tapLock = setupTapUnlock(brandTitle, tapHint, () => {
  void unlockAdmin();
});

// El modo admin exige la cuenta administradora configurada en el servidor.
let unlocking = false;
async function unlockAdmin(): Promise<void> {
  if (unlocking) return;
  const session = getSession();
  if (!session) {
    auth.openAuth("login", "El modo admin es solo para la cuenta administradora. Entra con ella.");
    tapLock.lock(); // resetea los toques para reintentar limpio tras entrar
    return;
  }
  unlocking = true;
  tapHint.textContent = "Verificando…";
  try {
    const st = await adminStatus();
    if (!st.isAdmin) {
      tapHint.textContent = "";
      toast("Tu cuenta no tiene acceso al modo admin.");
      tapLock.lock(); // resetea los toques para reintentar limpio
      return;
    }
    tapHint.textContent = "";
    admin.setUnlocked(true);
    await refreshAdmin();
    // Lleva al panel para que la salida sea descubrible.
    adminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    tapHint.textContent = "";
    toast("No se pudo verificar. Revisa tu conexión e intenta de nuevo.");
  } finally {
    unlocking = false;
  }
}

filters.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-cat]") as HTMLElement | null;
  if (!btn) return;
  activeCat = btn.dataset.cat ?? "all";
  showHidden = false;
  page = 1;
  filters.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
  void loadPage();
});

search.addEventListener("input", () => {
  showHidden = false;
  page = 1;
  void loadPage();
});

// Anuncio GTA VI: Reservar aparta el juego directo al carrito.
document.getElementById("gtaReserveBtn")?.addEventListener("click", () => {
  const gta = all.find((p) => /gta/i.test(p.name)) ?? all.find((p) => p.hidden);
  if (!gta) {
    toast("La reserva no está disponible ahora mismo.");
    return;
  }
  const inCart = getCart().find((l) => l.id === gta.id)?.qty ?? 0;
  if (gta.stock - inCart <= 0) {
    toast(`Sin stock de "${gta.name}" por ahora.`);
    return;
  }
  showHidden = true;
  addToCart(gta.id);
  cart.renderCart();
  paint();
  toast(`Agregado: ${gta.name} 🛒`);
  cart.openCart();
});

prevBtn.addEventListener("click", () => {
  if (page <= 1) return;
  page -= 1;
  void loadPage(true);
});

nextBtn.addEventListener("click", () => {
  if (page >= totalPages()) return;
  page += 1;
  void loadPage(true);
});

// Lanzamiento GTA VI: 19 de noviembre de 2026 (hora RD).
setupCountdown("2026-11-19T04:00:00Z");

async function reload(): Promise<void> {
  all = await fetchProducts();
  await refreshAdmin();
  cart.renderCart();
  await loadPage();
}

/** Pinta el panel admin (catálogo + registro de compras si hay sesión). */
async function refreshAdmin(): Promise<void> {
  admin.renderAdminList(all);
  if (!admin.isUnlocked()) {
    admin.renderOrders([], "");
    return;
  }
  try {
    admin.renderOrders(await adminOrders(), "");
  } catch (e) {
    admin.renderOrders([], e instanceof Error && e.message === "FORBIDDEN"
      ? "Solo los administradores pueden ver las compras (entra con cuenta admin)."
      : "Entra con tu cuenta para ver el registro.");
  }
}

/** Pide la ventana actual (offset/limit) y pinta. */
async function loadPage(scroll = false): Promise<void> {
  pageResult = await fetchPage({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    category: activeCat,
    query: search.value,
    includeHidden: showHidden,
  });
  // Why clamp: si el total encogió (borrado), la página pedida puede quedar vacía.
  if (pageResult.items.length === 0 && pageResult.total > 0 && page > 1) {
    page = totalPages();
    pageResult = await fetchPage({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      category: activeCat,
      query: search.value,
      includeHidden: showHidden,
    });
  }
  paint();
  if (scroll) grid.scrollIntoView({ behavior: "smooth", block: "start" });
}

function totalPages(): number {
  return Math.max(1, Math.ceil(pageResult.total / PAGE_SIZE));
}

function paint(): void {
  const items = pageResult.items;
  const reserved = new Map(getCart().map((l) => [l.id, l.qty] as const));
  renderStore(
    grid,
    empty,
    count,
    items,
    (id) => {
      addToCart(id);
      cart.renderCart();
      paint();
      const p = all.find((x) => x.id === id);
      toast(p ? `Agregado: ${p.name} 🛒` : "Agregado al carrito 🛒");
    },
    (id) => reserved.get(id) ?? 0,
    (id) => detail.openDetail(id)
  );
  if (statTotal) statTotal.textContent = String(all.length);
  count.textContent = pageResult.total === 1 ? "1 producto" : `${pageResult.total} productos`;
  pageLabel.textContent = `Página ${page} de ${totalPages()}`;
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages();
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta #${id}`);
  return node;
}

void reload().then(() => {
  // Deep link: #/p/:id abre el detalle (sirve para compartir por WhatsApp).
  try {
    const m = /^#\/p\/(.+)$/.exec(window.location.hash);
    if (m) detail.openDetail(decodeURIComponent(m[1]));
  } catch { /* sin hash disponible */ }
});
