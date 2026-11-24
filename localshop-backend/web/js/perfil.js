const ORDER_STEPS = [
  { key: "pendiente", label: "Preparando" },
  { key: "enviado", label: "En camino" },
  { key: "entregado", label: "Entregado" },
];
const ESTADO_TEXTO = { pendiente: "Preparando", enviado: "En camino", entregado: "Entregado", cancelado: "Cancelado" };

let SESSION = null;
let ULTIMOS_PEDIDOS = [];
let ULTIMA_FIRMA = "";
const DETALLES_ABIERTOS = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  SESSION = requireSession("cliente");
  if (!SESSION) return;

  document.getElementById("profileAvatar").innerHTML = avatarHtml(SESSION.name, "lg");
  document.getElementById("userName").textContent = SESSION.name;
  document.getElementById("userEmail").textContent = SESSION.email;
  document.getElementById("userSince").textContent = "Cliente LocalShop";

  Cart.init();
  renderOrders();
  setInterval(renderOrders, 8000);
  document.addEventListener("orders:changed", renderOrders);
  loadFavoritesCount();

  document.querySelectorAll(".dropdown-btn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  if (location.hash === "#configuracion") showTab("configuracion");
  document.getElementById("activeOrdersList").addEventListener("click", onHistoryClick);

  document.getElementById("orderHistory").addEventListener("click", onHistoryClick);

  document.getElementById("editBtn").addEventListener("click", () => openSettingsModal("info"));
  document.querySelectorAll(".settings-item[data-setting]").forEach((item) => {
    item.addEventListener("click", () => openSettingsModal(item.dataset.setting));
  });
  document.getElementById("settingsModalClose").addEventListener("click", closeSettingsModal);
  document.getElementById("settingsOverlay").addEventListener("click", (e) => {
    if (e.target.id === "settingsOverlay") closeSettingsModal();
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("¿Deseas cerrar sesión?")) Store.logoutAndLeave();
  });
});

function showTab(tab) {
  document.querySelectorAll(".dropdown-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-content").forEach((c) => (c.style.display = c.id === tab ? "block" : "none"));
  if (tab === "favoritos") renderFavoritos();
}

async function renderFavoritos() {
  const box = document.getElementById("favoritesList");
  let favs = [];
  try { favs = await Api.get("/favoritos"); } catch (err) { showApiError(err); return; }
  document.getElementById("statFavs").textContent = favs.length;
  if (!favs.length) {
    box.innerHTML = '<p class="empty-state">Aún no tienes favoritos. Toca el corazón en la página de un negocio para guardarlo aquí.</p>';
    return;
  }
  box.innerHTML = favs.map((n) => `
    <div class="order-row fav-row">
      <a class="order-thumb" href="negocio.html?id=${n.id}">${Img.negocio(n)}</a>
      <div class="fav-info"><h4>${esc(n.nombre_negocio)}</h4><p class="meta">${esc(n.categoria_nombre || "")} - ${esc(n.direccion || "")}</p></div>
      <div class="order-actions">
        <a class="small-btn" href="negocio.html?id=${n.id}">Ver menú</a>
        <button class="small-btn" data-unfav="${n.id}">Quitar</button>
      </div>
    </div>`).join("");
  box.querySelectorAll("[data-unfav]").forEach((b) => b.addEventListener("click", async () => {
    try { await Api.post("/favoritos", { negocios_id: Number(b.dataset.unfav) }); renderFavoritos(); toast("Quitado de favoritos"); } catch (err) { showApiError(err); }
  }));
}

async function loadFavoritesCount() {
  try {
    const favs = await Api.get("/favoritos");
    document.getElementById("statFavs").textContent = favs.length;
  } catch (err) { /* el contador queda en 0 */ }
}

/* ================= Pedidos ================= */
function parseFecha(texto) {
  return new Date(String(texto).replace(" ", "T"));
}
function formatFecha(texto) {
  const d = parseFecha(texto);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

async function renderOrders() {
  let orders;
  try {
    orders = await Api.get("/pedidos");
  } catch (err) {
    showApiError(err);
    return;
  }

  // Si nada cambió no se vuelve a dibujar: así no se cierran los detalles que la persona abrió.
  const firma = JSON.stringify(orders.map((o) => [o.id, o.estado, o.resena_calificacion || 0]));
  if (firma === ULTIMA_FIRMA) return;
  ULTIMA_FIRMA = firma;
  ULTIMOS_PEDIDOS = orders;

  document.getElementById("statOrders").textContent = orders.length;

  const active = orders.filter((o) => o.estado === "pendiente" || o.estado === "enviado");
  const activeSection = document.getElementById("activeOrdersSection");
  const activeList = document.getElementById("activeOrdersList");
  activeList.innerHTML = active.map(activeOrderHtml).join("");
  activeSection.style.display = active.length ? "block" : "none";

  document.getElementById("noOrders").style.display = orders.length ? "none" : "block";
  document.getElementById("orderHistory").innerHTML = orders.map(historyCardHtml).join("");
}

function activeOrderHtml(order) {
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === order.estado);
  const itemCount = (order.detalle || []).reduce((s, d) => s + d.cantidad, 0);

  const stepsHtml = ORDER_STEPS.map((step, idx) => {
    const state = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "";
    return `<div class="track-step ${state}"><span class="track-dot"></span><span class="track-label">${step.label}</span></div>`;
  }).join('<div class="track-line"></div>');

  const etaText =
    order.estado === "pendiente"
      ? '<p class="track-eta">El negocio está preparando tu pedido</p>'
      : `<p class="track-eta">En camino, tiempo estimado ${order.tiempo_entrega || 30} min</p>`;

  return `
    <div class="order-row tracking-card">
      <div class="order-row-head">
        <h4>${esc(order.nombre_negocio)}</h4>
        <p class="meta">Pedido #${order.id} · ${itemCount} producto(s) · ${Store.money(order.total)}</p>
      </div>
      <div class="track-steps">${stepsHtml}</div>
      ${etaText}
      <div class="order-actions track-actions">
        ${order.estado === "pendiente" ? `<button class="small-btn danger" data-cancel="${order.id}">Cancelar pedido</button>` : ""}
        <button class="small-btn" data-invoice="${order.id}">Ver factura</button>
      </div>
    </div>`;
}

function historyCardHtml(order) {
  const detalle = order.detalle || [];
  const resumen = detalle.map((d) => `${d.cantidad} x ${esc(d.nombre_producto)}`).join(", ");
  const abierto = DETALLES_ABIERTOS.has(order.id);

  const lineas = detalle.map((d) => `
    <div class="order-detail-line">
      <span>${d.cantidad} x ${esc(d.nombre_producto)}${d.nota ? `<small>Nota: ${esc(d.nota)}</small>` : ""}</span>
      <span>${Store.money(d.precio_total)}</span>
    </div>`).join("");

  const detalleHtml = `
    <div class="order-detail" ${abierto ? "" : "hidden"} id="detail-${order.id}">
      ${lineas}
      ${Number(order.descuento) > 0 ? `<div class="order-detail-line"><span>Descuento${order.promo_nombre ? ": " + esc(order.promo_nombre) : ""}</span><span>-${Store.money(order.descuento)}</span></div>` : ""}
      <div class="order-detail-line"><span>Envío</span><span>${Number(order.costo_envio) > 0 ? Store.money(order.costo_envio) : "Gratis"}</span></div>
      <div class="order-detail-info">
        ${order.direccion_entrega ? `<div>Entrega en: ${esc(order.direccion_entrega)}</div>` : ""}
        ${order.metodo_pago ? `<div>Pago: ${esc(order.metodo_pago)}</div>` : ""}
        ${order.nota ? `<div>Nota del pedido: ${esc(order.nota)}</div>` : ""}
      </div>
    </div>`;

  return `
    <article class="order-card-full" data-order="${order.id}">
      <div class="order-card-head">
        <a class="order-thumb" href="negocio.html?id=${order.negocios_id}">${Img.negocio({
          imagen_url: order.negocio_imagen, nombre_negocio: order.nombre_negocio, categoria_nombre: order.categoria_nombre,
        })}</a>
        <div class="order-title">
          <h4>${esc(order.nombre_negocio)}</h4>
          <p class="meta">Pedido #${order.id} · ${formatFecha(order.fecha_creacion)}</p>
        </div>
        <span class="order-status ${order.estado === "entregado" ? "entregado" : order.estado === "cancelado" ? "cancelado" : order.estado === "enviado" ? "enviado" : "progreso"}">${ESTADO_TEXTO[order.estado]}</span>
      </div>
      <p class="order-summary">${resumen}</p>
      <div class="order-card-foot">
        <strong>${Store.money(order.total)}</strong>
        <div class="order-actions">
          <button class="small-btn" data-toggle-detail="${order.id}">${abierto ? "Ocultar detalle" : "Ver detalle"}</button>
          ${order.estado !== "cancelado" ? `<button class="small-btn" data-invoice="${order.id}">Factura</button>` : ""}
          ${order.estado === "pendiente" ? `<button class="small-btn danger" data-cancel="${order.id}">Cancelar</button>` : ""}
          ${order.estado === "entregado" ? (order.resena_calificacion
            ? `<span class="rated-note">Tu calificación: ${order.resena_calificacion} de 5</span>`
            : `<button class="small-btn primary" data-rate="${order.id}">Calificar negocio</button>`) : ""}
          <button class="small-btn" data-reorder="${order.id}">Pedir de nuevo</button>
        </div>
      </div>
      ${detalleHtml}
    </article>`;
}

async function onHistoryClick(e) {
  const toggle = e.target.closest("[data-toggle-detail]");
  if (toggle) {
    const id = Number(toggle.dataset.toggleDetail);
    const panel = document.getElementById(`detail-${id}`);
    panel.hidden = !panel.hidden;
    if (panel.hidden) DETALLES_ABIERTOS.delete(id); else DETALLES_ABIERTOS.add(id);
    toggle.textContent = panel.hidden ? "Ver detalle" : "Ocultar detalle";
    return;
  }

  const invoice = e.target.closest("[data-invoice]");
  if (invoice) {
    const pedido = ULTIMOS_PEDIDOS.find((o) => o.id === Number(invoice.dataset.invoice));
    if (pedido) Factura.abrir(pedido);
    return;
  }

  const cancel = e.target.closest("[data-cancel]");
  if (cancel) {
    if (!confirm("¿Cancelar este pedido? Solo se puede mientras el negocio lo está preparando.")) return;
    cancel.disabled = true;
    try {
      await Api.put(`/pedidos/${cancel.dataset.cancel}`, { estado: "cancelado" });
      toast("Pedido cancelado");
      ULTIMA_FIRMA = "";
      await renderOrders();
    } catch (err) { cancel.disabled = false; showApiError(err); }
    return;
  }

  const rate = e.target.closest("[data-rate]");
  if (rate) {
    abrirCalificacion(ULTIMOS_PEDIDOS.find((o) => o.id === Number(rate.dataset.rate)));
    return;
  }

  const reorder = e.target.closest("[data-reorder]");
  if (reorder) {
    const pedido = ULTIMOS_PEDIDOS.find((o) => o.id === Number(reorder.dataset.reorder));
    if (!pedido) return;
    reorder.disabled = true;
    let agregados = 0;
    for (const linea of pedido.detalle || []) {
      try {
        await Cart.add(linea.productos_id, linea.cantidad, linea.nota || "");
        agregados++;
      } catch (err) { /* el producto ya no existe: se omite */ }
    }
    reorder.disabled = false;
    if (agregados === 0) {
      toast("Esos productos ya no están disponibles.");
    } else {
      toast(agregados === (pedido.detalle || []).length ? "Productos agregados al carrito" : "Algunos productos ya no están disponibles");
      Cart.open();
    }
  }
}

/* ================= Calificar al negocio ================= */
/** Una calificación por pedido entregado; se asocia al negocio, no a los productos. */
function abrirCalificacion(order) {
  if (!order || order.estado !== "entregado" || order.resena_calificacion) { toast("Ya calificaste este pedido"); return; }
  document.getElementById("settingsModalTitle").textContent = "Califica a " + order.nombre_negocio;
  const body = document.getElementById("settingsModalBody");
  body.innerHTML = `
    <div class="rate-block" data-rating="0">
      <p>¿Cómo fue tu experiencia con este negocio?</p>
      <div class="stars" role="radiogroup" aria-label="Calificación del negocio">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" data-star="${n}" aria-label="${n} de 5">&#9733;</button>`).join("")}
      </div>
      <textarea class="input-field" rows="3" maxlength="500" placeholder="Atención, tiempo de entrega, estado del pedido (opcional)"></textarea>
    </div>
    <p class="form-error" id="rateError" hidden></p>
    <button class="btn btn-primary btn-block" id="rateSend">Enviar calificación</button>`;
  document.getElementById("settingsOverlay").classList.add("open");

  const blk = body.querySelector(".rate-block");
  blk.querySelector(".stars").addEventListener("click", (e) => {
    const st = e.target.closest(".star");
    if (!st) return;
    blk.dataset.rating = st.dataset.star;
    blk.querySelectorAll(".star").forEach((x) => x.classList.toggle("on", Number(x.dataset.star) <= Number(st.dataset.star)));
  });
  document.getElementById("rateSend").addEventListener("click", async () => {
    const err = document.getElementById("rateError");
    const estrellas = Number(blk.dataset.rating);
    if (!estrellas) { err.textContent = "Elige de 1 a 5 estrellas."; err.hidden = false; return; }
    try {
      await Api.post("/reviews", {
        pedido_id: order.id,
        calificacion: estrellas,
        comentario: blk.querySelector("textarea").value.trim(),
      });
      closeSettingsModal();
      toast("Gracias por calificar a " + order.nombre_negocio);
      ULTIMA_FIRMA = "";
      renderOrders();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  });
}

/* ================= Configuración (conectada al backend) ================= */
function openSettingsModal(key) {
  const titles = { info: "Información personal", direcciones: "Mis direcciones", pagos: "Método de pago", preferencias: "Preferencias", seguridad: "Cambiar contraseña" };
  document.getElementById("settingsModalTitle").textContent = titles[key] || "Configuración";
  const body = document.getElementById("settingsModalBody");
  body.innerHTML = '<p class="cart-empty">Cargando...</p>';
  document.getElementById("settingsOverlay").classList.add("open");

  if (key === "info") renderInfoForm(body);
  if (key === "direcciones") renderDireccionForm(body);
  if (key === "pagos") renderPagoForm(body);
  if (key === "preferencias") renderPreferenciasForm(body);
  if (key === "seguridad") renderSeguridadForm(body);
}
function closeSettingsModal() {
  document.getElementById("settingsOverlay").classList.remove("open");
}

async function renderInfoForm(body) {
  let usuario = {};
  try { usuario = await Api.get(`/usuarios/${SESSION.id}`); } catch (err) { showApiError(err); }

  body.innerHTML = `
    <label class="field-label" for="infoName">Nombre completo</label>
    <input type="text" class="input-field" id="infoName" value="${esc(usuario.nombre_completo || SESSION.name)}">
    <label class="field-label" for="infoEmail">Correo electrónico</label>
    <input type="email" class="input-field" id="infoEmail" value="${esc(usuario.correo || SESSION.email)}">
    <label class="field-label" for="infoPhone">Teléfono</label>
    <input type="text" class="input-field" id="infoPhone" value="${esc(usuario.telefono || "")}">
    <p class="form-error" id="infoError" hidden></p>
    <button class="btn btn-primary btn-block" id="infoSaveBtn">Guardar cambios</button>`;

  document.getElementById("infoSaveBtn").addEventListener("click", async () => {
    const errorEl = document.getElementById("infoError");
    errorEl.hidden = true;
    try {
      const nombre = document.getElementById("infoName").value.trim();
      const correo = document.getElementById("infoEmail").value.trim();
      await Api.put(`/usuarios/${SESSION.id}`, {
        nombre_completo: nombre,
        correo,
        telefono: document.getElementById("infoPhone").value.trim(),
      });
      SESSION.name = nombre;
      SESSION.email = correo;
      Store.setSession(SESSION);
      document.getElementById("userName").textContent = nombre;
      document.getElementById("userEmail").textContent = correo;
      document.getElementById("profileAvatar").innerHTML = avatarHtml(nombre, "lg");
      closeSettingsModal();
      toast("Información actualizada");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

async function getConfig() {
  try {
    return await Api.get("/configuracion");
  } catch (err) {
    return {};
  }
}

async function guardarConfig(cambios) {
  const actual = await getConfig();
  await Api.put("/configuracion", {
    direccion: actual.direccion || "",
    metodo_pago: actual.metodo_pago || "efectivo",
    preferencias: actual.preferencias || "{}",
    ...cambios,
  });
}

async function renderDireccionForm(body) {
  let lista = [];
  try { lista = await Api.get("/direcciones"); } catch (err) { showApiError(err); }
  body.innerHTML = `
    <div class="address-list">
      ${lista.length ? lista.map((d) => `
        <div class="address-item">
          <div><strong>${esc(d.etiqueta)}</strong><p>${esc(d.direccion)}</p></div>
          <button class="small-btn danger" data-addr-del="${d.id}">Quitar</button>
        </div>`).join("") : '<p class="cart-empty">Aún no tienes direcciones guardadas.</p>'}
    </div>
    <h4 class="address-new-title">Agregar una dirección</h4>
    <label class="field-label" for="addrLabel">Nombre (casa, trabajo...)</label>
    <input type="text" class="input-field" id="addrLabel" maxlength="40">
    <label class="field-label" for="addrText">Dirección</label>
    <textarea class="input-field" id="addrText" rows="2" maxlength="250" placeholder="Calle, número, barrio y referencias"></textarea>
    <p class="form-error" id="addrError" hidden></p>
    <button class="btn btn-primary btn-block" id="addrSave">Guardar dirección</button>`;

  body.querySelectorAll("[data-addr-del]").forEach((b) => b.addEventListener("click", async () => {
    try { await Api.del(`/direcciones/${b.dataset.addrDel}`); renderDireccionForm(body); toast("Dirección eliminada"); } catch (err) { showApiError(err); }
  }));
  document.getElementById("addrSave").addEventListener("click", async () => {
    const errorEl = document.getElementById("addrError");
    errorEl.hidden = true;
    try {
      const direccion = document.getElementById("addrText").value.trim();
      await Api.post("/direcciones", { etiqueta: document.getElementById("addrLabel").value.trim(), direccion });
      // La primera dirección también queda como la predeterminada del checkout.
      if (!lista.length) await guardarConfig({ direccion });
      renderDireccionForm(body);
      toast("Dirección guardada");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

async function renderPagoForm(body) {
  const config = await getConfig();
  const options = [
    { value: "efectivo", label: "Efectivo contraentrega" },
    { value: "PSE", label: "PSE" },
    { value: "Tarjeta de credito o debito", label: "Tarjeta de crédito o débito" },
  ];
  body.innerHTML = `
    <label class="field-label" for="pagoSelect">Método de pago preferido</label>
    <select class="input-field" id="pagoSelect">
      ${options.map((o) => `<option value="${esc(o.value)}" ${config.metodo_pago === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>
    <button class="btn btn-primary btn-block" id="pagoSaveBtn">Guardar</button>`;
  document.getElementById("pagoSaveBtn").addEventListener("click", async () => {
    try {
      await guardarConfig({ metodo_pago: document.getElementById("pagoSelect").value });
      closeSettingsModal();
      toast("Método de pago guardado");
    } catch (err) { showApiError(err); }
  });
}

async function renderPreferenciasForm(body) {
  const config = await getConfig();
  let prefs = { notifications: true, shareLocation: true };
  try { prefs = { ...prefs, ...JSON.parse(config.preferencias || "{}") }; } catch (e) { /* preferencias sin formato: se usan las de fábrica */ }

  body.innerHTML = `
    <div class="pref-row"><div><strong>Notificaciones push</strong><p>Recibe alertas del estado de tus pedidos</p></div>
      <label class="switch"><input type="checkbox" id="prefNotif" ${prefs.notifications ? "checked" : ""}><span class="slider"></span></label></div>
    <div class="pref-row"><div><strong>Compartir ubicación</strong><p>Mejora la precisión de negocios cercanos</p></div>
      <label class="switch"><input type="checkbox" id="prefLoc" ${prefs.shareLocation ? "checked" : ""}><span class="slider"></span></label></div>
    <button class="btn btn-primary btn-block" style="margin-top:14px;" id="prefSaveBtn">Guardar preferencias</button>`;

  document.getElementById("prefSaveBtn").addEventListener("click", async () => {
    try {
      await guardarConfig({
        preferencias: JSON.stringify({
          notifications: document.getElementById("prefNotif").checked,
          shareLocation: document.getElementById("prefLoc").checked,
        }),
      });
      closeSettingsModal();
      toast("Preferencias guardadas");
    } catch (err) { showApiError(err); }
  });
}

function renderSeguridadForm(body) {
  body.innerHTML = `
    <label class="field-label" for="secActual">Contraseña actual</label>
    <input type="password" class="input-field" id="secActual" autocomplete="current-password">
    <label class="field-label" for="secNueva">Contraseña nueva</label>
    <input type="password" class="input-field" id="secNueva" autocomplete="new-password">
    <p class="pass-hint">Mínimo 8 caracteres, con al menos una letra y un número.</p>
    <label class="field-label" for="secConfirmar">Repite la contraseña nueva</label>
    <input type="password" class="input-field" id="secConfirmar" autocomplete="new-password">
    <p class="form-error" id="secError" hidden></p>
    <button class="btn btn-primary btn-block" id="secSaveBtn">Cambiar contraseña</button>`;

  document.getElementById("secSaveBtn").addEventListener("click", async () => {
    const errorEl = document.getElementById("secError");
    errorEl.hidden = true;
    const nueva = document.getElementById("secNueva").value;
    if (nueva !== document.getElementById("secConfirmar").value) {
      errorEl.textContent = "Las contraseñas nuevas no coinciden.";
      errorEl.hidden = false;
      return;
    }
    try {
      await Api.put(`/usuarios/${SESSION.id}/password`, {
        actual: document.getElementById("secActual").value,
        nueva,
      });
      closeSettingsModal();
      toast("Contraseña actualizada");
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}
