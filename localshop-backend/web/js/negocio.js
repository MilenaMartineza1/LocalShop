let CURRENT_BIZ = null;
let CURRENT_PRODUCTS = [];
let CURRENT_PROMOS = [];

document.addEventListener("DOMContentLoaded", async () => {
  const session = requireSession("cliente");
  if (!session) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) { window.location.replace("index.html"); return; }

  try {
    CURRENT_BIZ = await Api.get(`/negocios/${id}`);
  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;">${esc(err.message)}</p>`;
    return;
  }

  renderHeader(CURRENT_BIZ);

  document.querySelectorAll(".biz-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".biz-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tabMenu").classList.toggle("hidden", tab.dataset.tab !== "menu");
      document.getElementById("tabReviews").classList.toggle("hidden", tab.dataset.tab !== "reviews");
    });
  });

  document.getElementById("viewCartBtn").addEventListener("click", Cart.open);
  document.getElementById("menuGrid").addEventListener("click", onMenuClick);
  document.getElementById("menuGrid").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("menu-item")) openProduct(Number(e.target.dataset.id));
  });
  // Cada vez que cambia el carrito se actualizan las insignias del menú y la barra inferior
  document.addEventListener("cart:changed", () => {
    renderMenu();
    updateCartBar();
  });

  await Cart.init();
  CURRENT_PRODUCTS = await Api.get(`/productos?negocio_id=${id}`);
  try { CURRENT_PROMOS = await Api.get(`/promociones?negocio_id=${id}`); } catch (e) { CURRENT_PROMOS = []; }
  renderMenu();
  updateCartBar();

  await Promise.all([loadReviews(id), setupFavoriteButton(session, id)]);
});

function renderHeader(biz) {
  document.getElementById("bizHeaderName").textContent = biz.nombre_negocio;
  document.getElementById("bizName").textContent = biz.nombre_negocio;
  document.getElementById("bizCategory").textContent = biz.categoria_nombre || "";
  document.getElementById("bizCover").style.backgroundImage = `url("${Img.negocioBanner(biz)}")`;
  document.getElementById("bizRating").textContent = biz.rating > 0 ? biz.rating : "Nuevo";
  document.getElementById("bizReviewCount").textContent = biz.review_count || 0;
  document.getElementById("bizTime").textContent = `${biz.tiempo_entrega_min || 30} min`;
  document.getElementById("bizDistance").textContent = biz.ciudad || "";
  document.getElementById("bizDelivery").textContent = biz.costo_envio > 0 ? Store.money(biz.costo_envio) : "Gratis";
  document.getElementById("bizDescription").textContent = biz.descripcion || "";
  document.getElementById("bizAddress").textContent = biz.direccion || "";
  document.getElementById("bizPhone").textContent = biz.telefono || "";
  document.getElementById("bizHours").textContent = biz.horario || "";
  document.getElementById("bizMinOrder").textContent = Store.money(biz.pedido_minimo);
}

async function setupFavoriteButton(session, negocioId) {
  const btn = document.getElementById("favToggleBtn");
  try {
    const favs = await Api.get("/favoritos");
    const isFav = favs.some((f) => f.id === parseInt(negocioId));
    btn.textContent = isFav ? "❤️" : "🤍";
    btn.classList.toggle("active", isFav);
  } catch (e) { /* si falla, el botón sigue funcionando igual */ }

  btn.addEventListener("click", async () => {
    try {
      const res = await Api.post("/favoritos", { negocios_id: negocioId });
      btn.textContent = res.favorited ? "❤️" : "🤍";
      btn.classList.toggle("active", res.favorited);
    } catch (err) { showApiError(err); }
  });
}

/* ---------------- Promociones ---------------- */
/** Mejor descuento automático para un producto (sin compra mínima), solo para mostrarlo en el menú.
 *  El valor que se cobra siempre lo calcula el servidor al confirmar el pedido. */
function promoDeProducto(producto) {
  let mejor = null;
  CURRENT_PROMOS.forEach((pr) => {
    if (Number(pr.compra_minima) > 0) return;
    if (pr.producto_id !== null && pr.producto_id !== producto.id) return;
    if (!mejor || Number(pr.descuento) > Number(mejor.descuento)) mejor = pr;
  });
  return mejor;
}

function renderPromoStrip() {
  let strip = document.getElementById("promoStrip");
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "promoStrip";
    strip.className = "promo-strip";
    document.getElementById("menuGrid").before(strip);
  }
  strip.hidden = CURRENT_PROMOS.length === 0;
  strip.innerHTML = CURRENT_PROMOS.map((pr) => {
    const alcance = pr.producto_id === null ? "en toda la tienda"
      : `en ${esc((CURRENT_PRODUCTS.find((p) => p.id === pr.producto_id) || {}).nombre_producto || "un producto")}`;
    const minimo = Number(pr.compra_minima) > 0 ? ` en compras desde ${Store.money(pr.compra_minima)}` : "";
    return `<div class="promo-chip"><b>${Number(pr.descuento)}%</b><span>${esc(pr.nombre)}: ${alcance}${minimo}. Se aplica al confirmar el pedido.</span></div>`;
  }).join("");
}

/* ---------------- Menú ---------------- */
function renderMenu() {
  const grid = document.getElementById("menuGrid");
  renderPromoStrip();

  if (!CURRENT_PRODUCTS.length) {
    grid.innerHTML = `
      <div class="empty-menu-state">
        <p><strong>Este negocio aún no ha cargado su catálogo.</strong></p>
        <p>Los productos aparecerán aquí en cuanto el dueño los agregue desde su panel.</p>
      </div>`;
    return;
  }

  const enCarrito = new Map();
  Cart.forBusiness(CURRENT_BIZ.id).forEach((i) => {
    enCarrito.set(i.producto_id, (enCarrito.get(i.producto_id) || 0) + i.cantidad);
  });

  grid.innerHTML = CURRENT_PRODUCTS.map((p) => {
    const qty = enCarrito.get(p.id) || 0;
    const stock = Number(p.stock) || 0;
    const agotado = stock <= 0;
    const promo = promoDeProducto(p);
    const precioHtml = promo
      ? `<span class="price"><s class="price-old">${Store.money(p.precio)}</s> ${Store.money(Math.round(p.precio * (1 - Number(promo.descuento) / 100)))}</span>`
      : `<span class="price">${Store.money(p.precio)}</span>`;
    const aviso = agotado ? '<span class="menu-item-stock out">Agotado</span>'
      : stock <= 5 ? `<span class="menu-item-stock low">Quedan ${stock}</span>` : "";
    return `
      <div class="menu-item${agotado ? " sold-out" : ""}" data-id="${p.id}" tabindex="0" role="button" aria-label="Ver ${esc(p.nombre_producto)}">
        ${qty > 0 ? `<span class="menu-item-qty">${qty} en tu carrito</span>` : ""}
        ${promo ? `<span class="menu-item-promo">-${Number(promo.descuento)}%</span>` : ""}
        ${Img.producto(p)}
        <div class="menu-item-body">
          <h4>${esc(p.nombre_producto)}</h4>
          <p>${esc(p.descripcion_producto)}</p>
          ${aviso}
          <div class="menu-item-footer">
            ${precioHtml}
            <button class="add-btn" data-quick-add="${p.id}" ${agotado ? "disabled" : ""} aria-label="Agregar ${esc(p.nombre_producto)} al carrito">+</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

async function onMenuClick(e) {
  const quick = e.target.closest("[data-quick-add]");
  if (quick) {
    e.stopPropagation();
    const producto = CURRENT_PRODUCTS.find((p) => p.id === Number(quick.dataset.quickAdd));
    try {
      await Cart.add(producto.id, 1, "");
      toast(`${producto.nombre_producto} agregado al carrito`);
    } catch (err) { showApiError(err); }
    return;
  }
  const card = e.target.closest(".menu-item");
  if (card && card.classList.contains("sold-out")) { toast("Este producto está agotado por ahora"); return; }
  if (card) openProduct(Number(card.dataset.id));
}

function openProduct(id) {
  const producto = CURRENT_PRODUCTS.find((p) => p.id === id);
  if (producto) ProductModal.open(producto);
}

function updateCartBar() {
  const bar = document.getElementById("cartBar");
  const lines = Cart.forBusiness(CURRENT_BIZ.id);
  if (!lines.length) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const total = lines.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const count = lines.reduce((sum, i) => sum + i.cantidad, 0);
  document.getElementById("cartBarCount").textContent = count === 1 ? "1 producto" : `${count} productos`;
  document.getElementById("cartBarTotal").textContent = Store.money(total);
}

/* ---------------- Reseñas ---------------- */
async function loadReviews(negocioId) {
  const reviews = await Api.get(`/reviews?negocio_id=${negocioId}`);
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.calificacion, 0) / reviews.length).toFixed(1) : "—";
  document.getElementById("reviewScore").textContent = avg;
  document.getElementById("reviewTotal").textContent = `${reviews.length} reseñas`;

  const list = document.getElementById("reviewsList");
  if (!reviews.length) {
    list.innerHTML = '<p class="cart-empty">Este negocio aún no tiene reseñas.</p>';
    return;
  }
  list.innerHTML = reviews.map((r) => `
    <div class="review-card">
      <div class="review-head"><strong>${esc(r.autor)}</strong><span>${"⭐".repeat(r.calificacion)}</span></div>
      <p>${esc(r.comentario || "")}</p>
    </div>`).join("");
}
