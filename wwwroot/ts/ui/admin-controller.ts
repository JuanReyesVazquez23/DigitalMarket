// Layer: ts/ui/admin-controller — modal alta/edición + lista admin + preview + salida.
import type { CreateProductDto, Product } from "../domain/models.js";
import type { AdminOrder } from "../data/order-repository.js";
import { createProduct, deleteProduct, updateProduct } from "../data/product-repository.js";
import { categoryOf, normalizeImageUrl, validateNewProduct, withImageFallback } from "../services/product-service.js";
import { toast } from "./cart-drawer.js";
import { downscaleImage, resolveUpload } from "../services/image.js";
import { formatPrice } from "../domain/models.js";

interface AdminDeps {
  onChanged: () => Promise<void>;
  onLock?: () => void;
}

const PLACEHOLDER_PREVIEW = "https://placehold.co/600x400/111111/E10600?text=Vista+previa";

export function setupAdmin(deps: AdminDeps): {
  openModal: () => void;
  renderAdminList: (items: Product[]) => void;
  renderOrders: (items: AdminOrder[], error: string) => void;
  setUnlocked: (v: boolean) => void;
  isUnlocked: () => boolean;
  /** Bloquea el admin y resetea los 10 toques (usado al cerrar sesión). */
  lock: () => void;
} {
  const backdrop = getEl("modalBackdrop");
  const adminPanel = getEl("adminPanel");
  const adminList = getEl("adminList");
  const adminBar = document.getElementById("adminBar");
  const modalEyebrow = document.getElementById("modalEyebrow");
  const modalTitle = getEl("modalTitle");
  const saveBtn = getEl("saveProductBtn") as HTMLButtonElement;

  const fName = getInput("fName");
  const fPrice = getInput("fPrice");
  const fStock = getInput("fStock");
  const fCategory = getEl("fCategory") as HTMLSelectElement;
  const fImageUrl = getInput("fImageUrl");
  const fImageFile = getEl("fImageFile") as HTMLInputElement;
  const fPreview = getEl("fPreview") as HTMLImageElement;
  const fDesc = getEl("fDesc") as HTMLTextAreaElement;
  const fHidden = getEl("fHidden") as HTMLInputElement;
  const formError = getEl("formError");
  const imgStatus = document.getElementById("imgStatus");

  let unlocked = false;
  // Archivo pendiente (se sube a Storage al guardar) + imagen ya guardada al editar.
  let pendingFile: File | null = null;
  let pendingPreviewUrl = "";
  let existingImage = "";
  let editingId: string | null = null;

  function setUnlocked(v: boolean): void {
    unlocked = v;
    adminPanel.style.display = v ? "block" : "none";
    if (adminBar) adminBar.hidden = !v;
    if (!v) closeModal();
  }

  function isUnlocked(): boolean {
    return unlocked;
  }

  function lock(): void {
    setUnlocked(false);
    deps.onLock?.();
  }

  function dropPendingFile(): void {
    pendingFile = null;
    if (pendingPreviewUrl !== "") {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = "";
    }
    fImageFile.value = "";
  }

  function resetForm(): void {
    fName.value = ""; fPrice.value = ""; fStock.value = "1";
    fCategory.value = "Consolas";
    fImageUrl.value = "";
    dropPendingFile();
    existingImage = "";
    fDesc.value = ""; fHidden.checked = false; formError.textContent = "";
    setImgStatus("");
    syncPreview();
  }

  function openCreate(): void {
    if (!unlocked) return;
    editingId = null;
    resetForm();
    if (modalEyebrow) modalEyebrow.textContent = "Admin · Alta";
    modalTitle.textContent = "Nuevo producto";
    saveBtn.textContent = "Guardar producto";
    openModal();
  }

  function openEdit(p: Product): void {
    if (!unlocked) return;
    editingId = p.id;
    formError.textContent = "";
    fName.value = p.name;
    fPrice.value = String(p.price);
    fStock.value = String(p.stock);
    fCategory.value = String(p.category);
    // La imagen guardada se conserva salvo que escribas URL o elijas archivo.
    dropPendingFile();
    existingImage = p.imageUrl;
    if (p.imageUrl.startsWith("data:image/")) {
      fImageUrl.value = "";
    } else {
      fImageUrl.value = p.imageUrl;
    }
    fDesc.value = p.description ?? "";
    fHidden.checked = p.hidden === true;
    setImgStatus("");
    if (modalEyebrow) modalEyebrow.textContent = "Admin · Edición";
    modalTitle.textContent = "Editar producto";
    saveBtn.textContent = "Guardar cambios";
    openModal();
  }

  function openModal(): void {
    if (!unlocked) return;
    backdrop.classList.add("open");
    document.body.classList.add("modal-open");
    window.setTimeout(() => fName.focus(), 50);
  }

  function closeModal(): void {
    backdrop.classList.remove("open");
    document.body.classList.remove("modal-open");
    editingId = null;
  }

  function setImgStatus(msg: string): void {
    if (imgStatus) imgStatus.textContent = msg;
  }

  function currentRawUrl(): string {
    // Prioridad: URL escrita > archivo elegido > imagen ya guardada.
    const typed = fImageUrl.value.trim();
    if (typed !== "") return typed;
    if (pendingPreviewUrl !== "") return pendingPreviewUrl;
    return existingImage;
  }

  function syncPreview(): void {
    const raw = currentRawUrl();
    // blob:/data: son previews locales, no pasan por normalización de URL.
    const url = raw.startsWith("blob:") || raw.startsWith("data:image/") ? raw : normalizeImageUrl(raw);
    if (url === "") {
      fPreview.dataset.failed = "";
      fPreview.src = PLACEHOLDER_PREVIEW;
      return;
    }
    fPreview.dataset.failed = "";
    // Evita recargar si es la misma URL (parpadeo).
    if (fPreview.src !== url) fPreview.src = url;
  }

  // La URL manda: al escribir, se descarta el archivo previo para que el preview sí cambie.
  fImageUrl.addEventListener("input", () => {
    if (fImageUrl.value.trim() !== "") dropPendingFile();
    setImgStatus("");
    syncPreview();
  });

  fImageFile.addEventListener("change", () => {
    const file = fImageFile.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImgStatus("Ese archivo no es una imagen. Elige un JPG, PNG o WEBP.");
      return;
    }
    dropPendingFile();
    pendingFile = file;
    pendingPreviewUrl = URL.createObjectURL(file);
    fImageUrl.value = "";
    setImgStatus("Se subirá a Storage al guardar.");
    syncPreview();
  });

  // Why onerror/onload: la queja era "pego URL y no se ve" sin saber por qué.
  // Ahora el preview avisa si el link no carga (hotlink bloqueado, link de página y no de imagen, etc).
  fPreview.addEventListener("error", () => {
    if (fPreview.dataset.failed === "1") return;
    fPreview.dataset.failed = "1";
    fPreview.src = PLACEHOLDER_PREVIEW;
    setImgStatus("Esa URL no cargó la imagen. Revisa que sea el link directo (termina en .jpg/.png/.webp) y que permita verla sin entrar a la página.");
  });
  fPreview.addEventListener("load", () => {
    if (fPreview.src.includes("placehold.co")) return;
    setImgStatus("");
  });
  syncPreview();

  // Botones: cerrar, cancelar, abrir (header + panel), salir (header + panel), Escape y click fuera.
  getEl("closeModalBtn").addEventListener("click", closeModal);
  getEl("cancelModalBtn").addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (backdrop.classList.contains("open")) closeModal();
      else if (unlocked) lock();
    }
  });
  document.getElementById("newProductBtn")?.addEventListener("click", openCreate);
  document.getElementById("newProductBtn2")?.addEventListener("click", openCreate);
  document.getElementById("exitAdminBtn")?.addEventListener("click", lock);
  document.getElementById("lockAdminBtn")?.addEventListener("click", lock);

  getEl("saveProductBtn").addEventListener("click", async () => {
    const typedUrl = normalizeImageUrl(fImageUrl.value);
    const provisional: CreateProductDto = withImageFallback({
      name: fName.value.trim(),
      price: Number(fPrice.value),
      category: categoryOf(fCategory.value),
      imageUrl: typedUrl !== "" ? typedUrl : existingImage,
      description: fDesc.value.trim(),
      stock: Math.max(0, Number(fStock.value || 0)),
      hidden: fHidden.checked,
    });
    const err = validateNewProduct(provisional);
    if (err) {
      formError.textContent = err;
      return;
    }
    formError.textContent = "";
    saveBtn.disabled = true;
    try {
      // Why: el archivo se optimiza y sube a Storage acá (URL manda y no había).
      let finalImage = provisional.imageUrl;
      if (typedUrl === "" && pendingFile) {
        setImgStatus("Subiendo imagen…");
        const small = await downscaleImage(pendingFile);
        finalImage = await resolveUpload(small, pendingFile.name);
        setImgStatus("");
      }
      const dto: CreateProductDto = { ...provisional, imageUrl: finalImage };
      const saved = editingId
        ? await updateProduct(editingId, dto)
        : await createProduct(dto);
      resetForm();
      closeModal();
      await deps.onChanged();
      toast(saved.remote
        ? "Guardado en el servidor ✓"
        : "Sin conexión: visible solo en este navegador ⚠️");
    } catch (e) {
      if (e instanceof Error && e.message === "NO_AUTH") {
        formError.textContent = "Necesitas entrar con tu cuenta para guardar. Usa el botón Entrar de arriba.";
      } else if (e instanceof Error && e.message !== "" && !e.message.startsWith("API ")) {
        formError.textContent = e.message;
      } else {
        formError.textContent = "No se pudo guardar. Revisa los datos e intenta de nuevo.";
      }
    } finally {
      saveBtn.disabled = false;
    }
  });

  function renderAdminList(items: Product[]): void {
    adminList.innerHTML = "";
    for (const p of items) {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `<img alt="" loading="lazy" /><div class="meta"><strong></strong><div class="muted"></div></div><div class="admin-actions"></div>`;
      const img = row.querySelector("img") as HTMLImageElement;
      img.src = p.imageUrl;
      img.alt = p.name;
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.onerror = null;
        img.src = `https://placehold.co/600x400/111111/E10600?text=${encodeURIComponent(p.name)}`;
      };
      (row.querySelector("strong") as HTMLElement).textContent = `${p.name} — ${formatPrice(p.price)}`;
      (row.querySelector(".muted") as HTMLElement).textContent =
        `${String(p.category)} • Stock ${p.stock}${p.hidden ? " • Oculto" : ""}`;
      const actions = row.querySelector(".admin-actions") as HTMLElement;

      const edit = document.createElement("button");
      edit.className = "btn btn-secondary btn-sm";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => openEdit(p));

      const del = document.createElement("button");
      del.className = "btn btn-danger btn-sm";
      del.textContent = "Eliminar";
      del.addEventListener("click", async () => {
        if (!window.confirm(`¿Eliminar "${p.name}" del catálogo?`)) return;
        try {
          await deleteProduct(p.id);
          await deps.onChanged();
        } catch (e) {
          if (e instanceof Error && e.message === "NO_AUTH") {
            window.alert("Entra con tu cuenta (botón Entrar arriba) para eliminar productos.");
          }
        }
      });

      actions.append(edit, del);
      adminList.appendChild(row);
    }
  }

  return { openModal: openCreate, renderAdminList, renderOrders, setUnlocked, isUnlocked, lock };
}

function formatOrderDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
}

function renderOrders(items: AdminOrder[], error: string): void {
  const list = getEl("ordersAdminList");
  const count = getEl("ordersAdminCount");
  const errEl = getEl("ordersAdminError");
  errEl.textContent = error;
  list.innerHTML = "";
  count.textContent = items.length === 0 ? "" : `${items.length} pedido(s)`;
  for (const o of items) {
    const card = document.createElement("div");
    card.className = "order";
    const lines = o.items.map((i) => `${i.quantity} × ${i.productName} — ${formatPrice(i.unitPrice * i.quantity)}`).join("\n");
    card.innerHTML = `<div class="order-head"><strong></strong><span class="order-date"></span></div><div class="order-buyer"></div><div class="order-items"></div><div class="order-total"><span>Total</span><strong></strong></div>`;
    (card.querySelector(".order-head strong") as HTMLElement).textContent = `Pedido #${o.id.slice(0, 8)}`;
    (card.querySelector(".order-date") as HTMLElement).textContent = formatOrderDate(o.createdAtUtc);
    (card.querySelector(".order-buyer") as HTMLElement).textContent = `👤 ${o.username}`;
    (card.querySelector(".order-items") as HTMLElement).textContent = lines;
    (card.querySelector(".order-total strong") as HTMLElement).textContent = formatPrice(o.total);
    list.appendChild(card);
  }
}

function getEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id} en index.html`);
  return el;
}

function getInput(id: string): HTMLInputElement {
  return getEl(id) as HTMLInputElement;
}
