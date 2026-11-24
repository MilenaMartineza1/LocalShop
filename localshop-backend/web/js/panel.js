let MY_BIZ = null;
let SESSION = null;
let ORDERS = [];
let ORDER_FILTER = "todos";
let KNOWN_ORDER_IDS = null;
let PRODUCTS = [];
let CURRENT_VIEW = "inicio";
let SUPPLIES = [];
let SUPPLY_FILTER = "todos";

const VIEW_TITLES = {
  inicio: "Panel de administración",
  perfil: "Perfil del negocio",
  productos: "Productos y servicios",
  pedidos: "Pedidos",
  ventas: "Ventas del día",
  insumos: "Inventario de insumos",
  estadisticas: "Estadísticas",
  promociones: "Promociones",
  publicidad: "Publicidad local",
  soporte: "Soporte",
};
const STATUS_LABEL = { pendiente: "Preparando", enviado: "En camino", entregado: "Entregado", cancelado: "Cancelado" };
const STATUS_CLASS = { pendiente: "camino", enviado: "camino", entregado: "entregado", cancelado: "cancelado" };
const STOCK_BAJO = 5;

document.addEventListener("DOMContentLoaded", async () => {
  SESSION = requireSession("negocio");
  if (!SESSION) return;

  try {
    MY_BIZ = await Api.get(`/negocios/${SESSION.id}`);
  } catch (err) {
    showApiError(err);
    return;
  }

  fillProfile();
  setupNav();
  setupModal();
  setupSoporte();
  setupOrderFilters();

  document.getElementById("panelLogout").addEventListener("click", () => {
    if (confirm("¿Deseas cerrar sesión?")) Store.logoutAndLeave();
  });
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("panelBack").addEventListener("click", () => goToView("inicio"));
  document.getElementById("saveProfileBtn").addEventListener("click", guardarPerfil);
  document.getElementById("addProductBtn").addEventListener("click", () => abrirFormProducto(null));
  document.getElementById("createPromoBtn").addEventListener("click", abrirFormPromo);
  document.getElementById("productSearch").addEventListener("input", renderProductos);

  await refreshOrders(true);
  setupVentas();
  setupInsumos();
  await Promise.all([cargarProductos(), renderPromociones(), cargarInsumos()]);
  await renderInicio();
  renderPaquetes();
  await cargarCampanias();

  const params = new URLSearchParams(window.location.search);
  if (params.get("onboarding") === "1" && PRODUCTS.length === 0) {
    goToView("productos");
    const box = document.querySelector("#view-productos .panel-box");
    const banner = document.createElement("div");
    banner.className = "onboarding-banner";
    banner.innerHTML = "<strong>Bienvenido a LocalShop.</strong> Tu negocio ya está registrado, pero todavía no tiene productos. Agrega al menos uno para que los clientes puedan verlo y comprarte.";
    box.prepend(banner);
  }

  // Los pedidos nuevos llegan solos, sin recargar la página.
  setInterval(() => { if (!document.hidden && !modalAbierto()) refreshOrders(false); }, 8000);
});

/* ================= Navegación ================= */
function setupNav() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => goToView(btn.dataset.view));
  });
}

function goToView(view) {
  CURRENT_VIEW = view;
  document.querySelectorAll(".nav-item[data-view]").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("panelBack").hidden = view === "inicio";
  document.getElementById("topbarSection").textContent = VIEW_TITLES[view] || "";
  window.scrollTo({ top: 0 });
  if (view === "pedidos") renderPedidos();
  if (view === "inicio") renderInicio();
  if (view === "estadisticas") renderEstadisticas();
  if (view === "ventas") renderVentas();
  if (view === "insumos") cargarInsumos();
  if (view === "promociones") renderPromociones();
  if (view === "publicidad") cargarCampanias();
}

/* ================= Ventana de formularios ================= */
let modalSubmit = null;

function setupModal() {
  const backdrop = document.getElementById("panelModal");
  document.getElementById("panelModalCancel").addEventListener("click", cerrarModal);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cerrarModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modalAbierto()) cerrarModal(); });
  document.getElementById("panelModalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const err = document.getElementById("panelModalError");
    err.hidden = true;
    const datos = {};
    document.querySelectorAll("#panelModalFields [name]").forEach((el) => { datos[el.name] = el.value.trim(); });
    const btn = document.getElementById("panelModalSave");
    btn.disabled = true;
    try {
      const problema = await modalSubmit(datos);
      if (problema) { err.textContent = problema; err.hidden = false; }
      else cerrarModal();
    } catch (ex) {
      err.textContent = ex.message || "No se pudo guardar";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

/** campos: [{ name, label, type, value, attrs }]; onSubmit devuelve un texto de error o nada si todo salió bien. */
function abrirModal(titulo, campos, textoBoton, onSubmit) {
  document.getElementById("panelModalTitle").textContent = titulo;
  document.getElementById("panelModalSave").textContent = textoBoton;
  document.getElementById("panelModalError").hidden = true;
  document.getElementById("panelModalFields").innerHTML = campos.map((c) => {
    const valor = esc(c.value ?? "");
    const control = c.type === "select"
      ? `<select name="${c.name}" id="pm_${c.name}">${c.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(c.value ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`
      : c.type === "textarea"
      ? `<textarea name="${c.name}" id="pm_${c.name}" rows="3" ${c.attrs || ""}>${valor}</textarea>`
      : `<input name="${c.name}" id="pm_${c.name}" type="${c.type || "text"}" value="${valor}" ${c.attrs || ""}>`;
    return `<div class="pm-field"><label for="pm_${c.name}">${esc(c.label)}</label>${control}</div>`;
  }).join("");
  modalSubmit = onSubmit;
  document.getElementById("panelModal").hidden = false;
  const primero = document.querySelector("#panelModalFields input, #panelModalFields textarea");
  if (primero) primero.focus();
}

function cerrarModal() {
  document.getElementById("panelModal").hidden = true;
  modalSubmit = null;
}
function modalAbierto() {
  return !document.getElementById("panelModal").hidden;
}

/* ================= Perfil ================= */
function fillProfile() {
  document.getElementById("topbarBizName").textContent = MY_BIZ.nombre_negocio;
  document.getElementById("profileBizName").textContent = MY_BIZ.nombre_negocio;
  document.getElementById("profileBizCategory").textContent = `${MY_BIZ.categoria_nombre || ""} - ${MY_BIZ.direccion || ""}`;
  document.getElementById("profileAvatar").innerHTML = Img.negocio(MY_BIZ);
  document.getElementById("profileAddress").value = MY_BIZ.direccion || "";
  document.getElementById("profilePhone").value = MY_BIZ.telefono || "";
  document.getElementById("profileHours").value = MY_BIZ.horario || "";
  document.getElementById("profileCategory").value = MY_BIZ.categoria_nombre || "";
  document.getElementById("profileDelivery").value = MY_BIZ.tiempo_entrega_min || 30;
  document.getElementById("profileShipping").value = Math.round(Number(MY_BIZ.costo_envio) || 0);
  document.getElementById("profileMin").value = Math.round(Number(MY_BIZ.pedido_minimo) || 0);
  document.getElementById("profileDesc").value = MY_BIZ.descripcion || "";
  document.getElementById("previewLink").href = `negocio.html?id=${MY_BIZ.id}`;
}

async function guardarPerfil() {
  const err = document.getElementById("profileError");
  err.hidden = true;
  const direccion = document.getElementById("profileAddress").value.trim();
  const telefono = document.getElementById("profilePhone").value.trim();
  const tiempo = parseInt(document.getElementById("profileDelivery").value, 10);
  const envio = Number(document.getElementById("profileShipping").value);
  const minimo = Number(document.getElementById("profileMin").value);

  let problema = "";
  if (direccion.length < 5) problema = "Escribe la dirección del negocio.";
  else if (!/^[0-9+\s()-]{7,20}$/.test(telefono)) problema = "El teléfono debe tener entre 7 y 20 números.";
  else if (!(tiempo >= 5 && tiempo <= 240)) problema = "El tiempo de entrega debe estar entre 5 y 240 minutos.";
  else if (!(envio >= 0) || !(minimo >= 0)) problema = "El envío y el pedido mínimo no pueden ser negativos.";
  if (problema) { err.textContent = problema; err.hidden = false; return; }

  try {
    await Api.put(`/negocios/${SESSION.id}`, {
      direccion,
      telefono,
      horario: document.getElementById("profileHours").value.trim(),
      descripcion: document.getElementById("profileDesc").value.trim(),
      tiempo_entrega_min: tiempo,
      costo_envio: envio,
      pedido_minimo: minimo,
    });
    MY_BIZ = await Api.get(`/negocios/${SESSION.id}`);
    fillProfile();
    toast("Información del negocio actualizada");
  } catch (e) { showApiError(e); }
}

/* ================= Pedidos ================= */
async function refreshOrders(primera) {
  try {
    ORDERS = await Api.get("/pedidos");
  } catch (e) {
    if (primera) showApiError(e);
    return;
  }
  const ids = new Set(ORDERS.map((o) => o.id));
  if (KNOWN_ORDER_IDS) {
    const nuevos = ORDERS.filter((o) => !KNOWN_ORDER_IDS.has(o.id));
    if (nuevos.length) toast(nuevos.length === 1 ? `Llegó el pedido #${nuevos[0].id}` : `Llegaron ${nuevos.length} pedidos nuevos`);
  }
  KNOWN_ORDER_IDS = ids;
  actualizarContadores();
  if (CURRENT_VIEW === "pedidos") renderPedidos();
  if (CURRENT_VIEW === "inicio" && !primera) renderInicio();
  if (CURRENT_VIEW === "estadisticas") renderEstadisticas();
  if (CURRENT_VIEW === "ventas") renderVentas();
}

function actualizarContadores() {
  const cuenta = (e) => ORDERS.filter((o) => o.estado === e).length;
  document.getElementById("cntTodos").textContent = ORDERS.length;
  document.getElementById("cntPendiente").textContent = cuenta("pendiente");
  document.getElementById("cntEnviado").textContent = cuenta("enviado");
  document.getElementById("cntEntregado").textContent = cuenta("entregado");
  document.getElementById("cntCancelado").textContent = cuenta("cancelado");
  const porAtender = ORDERS.filter((o) => o.estado === "pendiente" || o.estado === "enviado").length;
  const badge = document.getElementById("navPedidosBadge");
  badge.textContent = porAtender;
  badge.hidden = porAtender === 0;
}

function setupOrderFilters() {
  document.getElementById("orderFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    ORDER_FILTER = chip.dataset.filter;
    document.querySelectorAll("#orderFilters .chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderPedidos();
  });
}

function renderPedidos() {
  const list = document.getElementById("panelOrdersList");
  const empty = document.getElementById("noPanelOrders");
  const visibles = ORDER_FILTER === "todos" ? ORDERS : ORDERS.filter((o) => o.estado === ORDER_FILTER);
  empty.style.display = visibles.length ? "none" : "block";
  empty.textContent = ORDERS.length
    ? "No hay pedidos en esta lista."
    : "Aún no hay pedidos. Cuando un cliente compre, aparecerá aquí.";

  list.innerHTML = visibles.map((o) => {
    const lineas = (o.detalle || []).map((d) => `
      <li><span>${d.cantidad} x ${esc(d.nombre_producto)}</span>${d.nota ? `<em class="order-note">Nota del cliente: ${esc(d.nota)}</em>` : ""}</li>`).join("");
    const fecha = new Date(String(o.fecha_creacion).replace(" ", "T"));
    return `
      <div class="order-row-panel" data-order="${o.id}">
        <div class="top">
          <h4>Pedido #${o.id} - ${esc(o.cliente_nombre)}</h4>
          <span class="badge-status ${STATUS_CLASS[o.estado]}">${STATUS_LABEL[o.estado]}</span>
        </div>
        <ul class="order-lines">${lineas}</ul>
        <div class="order-meta-row">
          <span>Total: ${Store.money(o.total)}${Number(o.descuento) > 0 ? ` (con ${Store.money(o.descuento)} de descuento: ${esc(o.promo_nombre || "")})` : ""}</span>
          <span>${fecha.toLocaleDateString("es-CO")} ${fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>Pago: ${esc(o.metodo_pago || "sin dato")}</span>
        </div>
        <div class="order-delivery">
          ${o.direccion_entrega ? `<div>Entregar en: ${esc(o.direccion_entrega)}</div>` : ""}
          ${o.cliente_telefono ? `<div>Teléfono del cliente: ${esc(o.cliente_telefono)}</div>` : ""}
          ${o.nota ? `<div>Nota del pedido: ${esc(o.nota)}</div>` : ""}
        </div>
        <div class="actions">
          ${o.estado === "pendiente" ? `<button class="btn btn-accent" data-avanzar="${o.id}" data-estado="enviado">Marcar como enviado</button>` : ""}
          ${o.estado === "enviado" ? `<button class="btn btn-primary" data-avanzar="${o.id}" data-estado="entregado">Marcar como entregado</button>` : ""}
          ${o.estado === "pendiente" ? `<button class="btn btn-outline danger" data-cancelar="${o.id}">Rechazar pedido</button>` : ""}
          <button class="btn btn-outline" data-factura="${o.id}">Ver factura</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-factura]").forEach((btn) => btn.addEventListener("click", () => {
    Factura.abrir(ORDERS.find((o) => o.id === Number(btn.dataset.factura)));
  }));
  list.querySelectorAll("[data-cancelar]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("¿Rechazar este pedido? El cliente lo verá como cancelado y el stock se devuelve.")) return;
    try {
      await Api.put(`/pedidos/${btn.dataset.cancelar}`, { estado: "cancelado" });
      toast("Pedido rechazado");
      await refreshOrders(false);
      await cargarProductos();
    } catch (e) { showApiError(e); }
  }));
  list.querySelectorAll("[data-avanzar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await Api.put(`/pedidos/${btn.dataset.avanzar}`, { estado: btn.dataset.estado });
        toast(btn.dataset.estado === "enviado" ? "Pedido marcado como enviado" : "Pedido marcado como entregado");
        await refreshOrders(false);
      } catch (e) { btn.disabled = false; showApiError(e); }
    });
  });
}

/* ================= Inicio ================= */
function esHoy(valor) {
  const d = new Date(String(valor).replace(" ", "T"));
  const h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

async function renderInicio() {
  const vigentes = ORDERS.filter((o) => o.estado !== "cancelado");
  const active = vigentes.filter((o) => o.estado !== "entregado");
  const completed = ORDERS.filter((o) => o.estado === "entregado");
  const ventasHoy = vigentes.filter((o) => esHoy(o.fecha_creacion)).reduce((s, o) => s + Number(o.total), 0);
  const ventasTotal = vigentes.reduce((s, o) => s + Number(o.total), 0);

  document.getElementById("statSalesToday").textContent = Store.money(ventasHoy);
  document.getElementById("statSalesTotal").textContent = `Acumulado: ${Store.money(ventasTotal)}`;
  document.getElementById("statActiveOrders").textContent = active.length;
  const nuevos = ORDERS.filter((o) => o.estado === "pendiente").length;
  document.getElementById("statActiveNew").textContent = nuevos ? `${nuevos} sin atender` : "todo al día";
  document.getElementById("statCompletedOrders").textContent = completed.length;

  try {
    const resenas = await Api.get(`/reviews?negocio_id=${SESSION.id}`);
    const prom = resenas.length ? resenas.reduce((s, r) => s + Number(r.calificacion), 0) / resenas.length : null;
    MY_BIZ._rating = prom;
    document.getElementById("statRating").textContent = prom === null ? "Nuevo" : prom.toFixed(1);
    document.getElementById("statReviews").textContent = `${resenas.length} reseña${resenas.length === 1 ? "" : "s"}`;
  } catch (e) { /* la tarjeta queda como estaba */ }

  const avisos = [];
  const sinAtender = ORDERS.filter((o) => o.estado === "pendiente");
  if (sinAtender.length) avisos.push([`Tienes ${sinAtender.length} pedido${sinAtender.length === 1 ? "" : "s"} sin atender`, "Entra a Pedidos para prepararlos"]);
  const faltan = SUPPLIES.filter((i) => Number(i.cantidad) <= Number(i.minimo));
  if (faltan.length) avisos.push([`${faltan.length} insumo${faltan.length === 1 ? "" : "s"} por reponer: ${faltan.slice(0, 3).map((i) => i.nombre).join(", ")}`, "Revisa la lista de compras en Insumos"]);
  const bajos = PRODUCTS.filter((p) => Number(p.activo) !== 0 && Number(p.stock) <= STOCK_BAJO);
  if (bajos.length) avisos.push([`${bajos.length} producto${bajos.length === 1 ? "" : "s"} con poco stock o agotados${bajos.length ? ": " + bajos.slice(0, 3).map((p) => p.nombre_producto).join(", ") : ""}`, "Actualiza el stock en Productos"]);
  try {
    const promos = await Api.get(`/promociones?negocio_id=${SESSION.id}`);
    const activa = promos.find((p) => p.estado === "activo");
    if (activa) avisos.push([`Tu promoción "${activa.nombre}" está activa`, `${Number(activa.descuento)}% de descuento`]);
  } catch (e) { /* sin promociones */ }
  if (!avisos.length) avisos.push(["Todo en orden por ahora", "Los pedidos nuevos aparecerán aquí"]);
  document.getElementById("notifList").innerHTML = avisos.map(([t, s]) => `<li>${esc(t)}<span>${esc(s)}</span></li>`).join("");

  const recientes = ORDERS.slice(0, 4).map((o) => `Pedido #${o.id} de ${o.cliente_nombre}: ${STATUS_LABEL[o.estado].toLowerCase()} (${Store.money(o.total)})`);
  document.getElementById("activityList").innerHTML = (recientes.length ? recientes : ["Aún no hay pedidos registrados"]).map((t) => `<li>${esc(t)}</li>`).join("");
}

/* ================= Productos ================= */
async function cargarProductos() {
  PRODUCTS = await Api.get(`/productos?negocio_id=${SESSION.id}`);
  renderProductos();
}

function renderProductos() {
  const q = document.getElementById("productSearch").value.trim().toLowerCase();
  const lista = PRODUCTS.filter((p) => !q || p.nombre_producto.toLowerCase().includes(q));
  const table = document.getElementById("productTable");
  if (!lista.length) {
    table.innerHTML = `<p class="empty-state">${PRODUCTS.length ? "Ningún producto coincide con la búsqueda." : "Aún no tienes productos. Agrega el primero."}</p>`;
    return;
  }
  table.innerHTML = lista.map((p) => {
    const stock = Number(p.stock) || 0;
    const oculto = Number(p.activo) === 0;
    const etiqueta = oculto ? '<span class="stock-tag out">Oculto del menú</span>' : stock <= 0 ? '<span class="stock-tag out">Agotado</span>'
      : stock <= STOCK_BAJO ? `<span class="stock-tag low">Quedan ${stock}</span>`
      : `<span class="stock-tag">Stock ${stock}</span>`;
    return `
      <div class="product-row">
        ${Img.producto(p)}
        <div class="pinfo"><span class="pname">${esc(p.nombre_producto)}</span>${etiqueta}</div>
        <span class="price">${Store.money(p.precio)}</span>
        <button class="row-btn" data-edit="${p.id}">Editar</button>
        <button class="row-btn" data-visible="${p.id}" data-activo="${oculto ? 1 : 0}">${oculto ? "Mostrar" : "Ocultar"}</button>
        <button class="row-btn danger" data-remove="${p.id}">Eliminar</button>
      </div>`;
  }).join("");

  table.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    abrirFormProducto(PRODUCTS.find((p) => p.id === Number(b.dataset.edit)));
  }));
  table.querySelectorAll("[data-visible]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await Api.put(`/productos/${b.dataset.visible}`, { activo: b.dataset.activo === "1" });
      await cargarProductos();
      toast(b.dataset.activo === "1" ? "El producto vuelve a verse en el menú" : "Producto oculto del menú");
    } catch (e) { showApiError(e); }
  }));
  table.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
    const p = PRODUCTS.find((x) => x.id === Number(b.dataset.remove));
    if (!confirm(`¿Eliminar "${p.nombre_producto}"? Si ya tiene pedidos, se oculta del menú para conservar el historial.`)) return;
    try {
      const r = await Api.del(`/productos/${p.id}`);
      await cargarProductos();
      toast(r && r.oculto ? "Tenía pedidos: se ocultó del menú y se conserva en el historial" : "Producto eliminado");
    } catch (e) { showApiError(e); }
  }));
}

function abrirFormProducto(prod) {
  const editando = Boolean(prod);
  abrirModal(editando ? "Editar producto" : "Nuevo producto", [
    { name: "nombre_producto", label: "Nombre", value: prod?.nombre_producto, attrs: 'maxlength="100" required' },
    { name: "descripcion_producto", label: "Descripción", type: "textarea", value: prod?.descripcion_producto, attrs: 'maxlength="200"' },
    { name: "precio", label: "Precio (COP)", type: "number", value: prod ? Math.round(prod.precio) : "", attrs: 'min="100" step="100" required' },
    { name: "stock", label: "Unidades disponibles", type: "number", value: prod ? prod.stock : 20, attrs: 'min="0" step="1" required' },
  ], editando ? "Guardar cambios" : "Agregar producto", async (d) => {
    const precio = Number(d.precio);
    const stock = Number(d.stock);
    if (!d.nombre_producto) return "Escribe el nombre del producto.";
    if (!(precio >= 100)) return "El precio debe ser de al menos $100.";
    if (!Number.isInteger(stock) || stock < 0) return "El stock debe ser un número entero, desde 0.";
    const cuerpo = { nombre_producto: d.nombre_producto, descripcion_producto: d.descripcion_producto, precio, stock };
    if (editando) await Api.put(`/productos/${prod.id}`, cuerpo);
    else await Api.post("/productos", { ...cuerpo, categoria_id: MY_BIZ.categoria_id });
    await cargarProductos();
    toast(editando ? "Producto actualizado" : "Producto agregado");
  });
}

/* ================= Estadísticas ================= */
function renderEstadisticas() {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const porDia = new Array(7).fill(0);
  const vigentes = ORDERS.filter((o) => o.estado !== "cancelado");
  vigentes.forEach((o) => { porDia[new Date(String(o.fecha_creacion).replace(" ", "T")).getDay()] += Number(o.total); });
  const max = Math.max(...porDia, 1);
  document.getElementById("salesBars").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((i) => `
    <div class="bar-row"><span class="day">${dias[i]}</span><div class="bar-track"><div class="bar-fill" style="width:${(porDia[i] / max) * 100}%"></div></div><span class="val">${Store.money(porDia[i])}</span></div>`).join("");

  const conteo = {};
  vigentes.forEach((o) => (o.detalle || []).forEach((d) => { conteo[d.nombre_producto] = (conteo[d.nombre_producto] || 0) + d.cantidad; }));
  const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById("topProducts").innerHTML = top.length
    ? top.map(([n, q], i) => `<li><span><span class="dot">${i + 1}</span>${esc(n)}</span><strong>${q} unidades</strong></li>`).join("")
    : "<li>Aún no hay ventas registradas.</li>";

  const entregados = ORDERS.filter((o) => o.estado === "entregado");
  document.getElementById("metricCompleted").textContent = entregados.length;
  document.getElementById("metricTicket").textContent = vigentes.length
    ? Store.money(vigentes.reduce((s, o) => s + Number(o.total), 0) / vigentes.length) : "$0";
  document.getElementById("metricRating").textContent = MY_BIZ._rating == null ? "Sin reseñas" : MY_BIZ._rating.toFixed(1);
}

/* ================= Ventas del día ================= */
function fechaLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function pedidosDeLaFecha() {
  const dia = document.getElementById("salesDate").value;
  return ORDERS.filter((o) => fechaLocal(new Date(String(o.fecha_creacion).replace(" ", "T"))) === dia)
    .sort((a, b) => a.id - b.id);
}
function resumenVentas(lista) {
  const validos = lista.filter((o) => o.estado !== "cancelado");
  const total = validos.reduce((s, o) => s + Number(o.total), 0);
  const envios = validos.reduce((s, o) => s + Number(o.costo_envio || 0), 0);
  const porPago = {};
  validos.forEach((o) => { const k = o.metodo_pago || "sin dato"; porPago[k] = (porPago[k] || 0) + Number(o.total); });
  return { validos, total, envios, productos: total - envios, porPago, cancelados: lista.length - validos.length };
}

function setupVentas() {
  const fecha = document.getElementById("salesDate");
  fecha.value = fechaLocal(new Date());
  fecha.max = fecha.value;
  fecha.addEventListener("change", renderVentas);
  document.getElementById("salesCsv").addEventListener("click", descargarVentasCsv);
  document.getElementById("salesPrint").addEventListener("click", imprimirVentas);
}

function renderVentas() {
  const lista = pedidosDeLaFecha();
  const r = resumenVentas(lista);
  document.getElementById("salesSummary").innerHTML = [
    ["Pedidos válidos", r.validos.length],
    ["Venta total", Store.money(r.total)],
    ["En productos", Store.money(r.productos)],
    ["En envíos", Store.money(r.envios)],
  ].map(([t, v]) => `<div class="stat-card"><span class="stat-label">${t}</span><strong>${v}</strong></div>`).join("");

  const pagos = Object.entries(r.porPago);
  document.getElementById("salesPay").innerHTML = pagos.length
    ? "<span>Por forma de pago:</span>" + pagos.map(([k, v]) => `<span class="pay-chip">${esc(k)}: <b>${Store.money(v)}</b></span>`).join("")
      + (r.cancelados ? `<span class="pay-chip muted">Cancelados: ${r.cancelados}</span>` : "")
    : "";

  document.querySelector("#salesTable tbody").innerHTML = lista.map((o) => {
    const hora = new Date(String(o.fecha_creacion).replace(" ", "T")).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    const prods = (o.detalle || []).map((d) => `${d.cantidad} x ${d.nombre_producto}`).join(", ");
    return `<tr class="${o.estado === "cancelado" ? "row-void" : ""}"><td>#${o.id}</td><td>${hora}</td><td>${esc(o.cliente_nombre)}</td><td>${esc(prods)}</td><td>${esc(o.metodo_pago || "")}</td><td>${STATUS_LABEL[o.estado]}</td><td class="num">${Store.money(o.total)}</td></tr>`;
  }).join("");
  document.getElementById("salesEmpty").hidden = lista.length > 0;
  document.getElementById("salesTable").hidden = lista.length === 0;
}

function celdaCsv(valor) {
  let t = String(valor == null ? "" : valor).replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(t)) t = "'" + t; // evita que Excel lo interprete como fórmula
  return '"' + t.replace(/"/g, '""') + '"';
}

function descargarVentasCsv() {
  const lista = pedidosDeLaFecha();
  if (!lista.length) { toast("No hay pedidos en esta fecha para descargar"); return; }
  const filas = [["Pedido", "Fecha", "Hora", "Cliente", "Teléfono", "Productos", "Subtotal", "Envío", "Total", "Forma de pago", "Estado", "Dirección de entrega"]];
  lista.forEach((o) => {
    const d = new Date(String(o.fecha_creacion).replace(" ", "T"));
    const envio = Number(o.costo_envio || 0);
    filas.push([
      o.id, d.toLocaleDateString("es-CO"), d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      o.cliente_nombre, o.cliente_telefono || "",
      (o.detalle || []).map((x) => `${x.cantidad} x ${x.nombre_producto}${x.nota ? " (" + x.nota + ")" : ""}`).join(" | "),
      Math.round(Number(o.total) - envio), Math.round(envio), Math.round(Number(o.total)),
      o.metodo_pago || "", STATUS_LABEL[o.estado], o.direccion_entrega || "",
    ]);
  });
  const r = resumenVentas(lista);
  filas.push([], ["", "", "", "", "", "TOTAL (sin cancelados)", Math.round(r.productos), Math.round(r.envios), Math.round(r.total)]);
  // Punto y coma y BOM: así Excel en español abre las columnas y las tildes bien.
  const csv = "\uFEFF" + filas.map((f) => f.map(celdaCsv).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas_${MY_BIZ.nombre_negocio.replace(/[^\w]+/g, "_")}_${document.getElementById("salesDate").value}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Reporte descargado");
}

function imprimirVentas() {
  const lista = pedidosDeLaFecha();
  const r = resumenVentas(lista);
  const filas = lista.map((o) => `<tr><td>#${o.id}</td><td>${esc(o.cliente_nombre)}</td><td>${esc(STATUS_LABEL[o.estado])}</td><td class="num">${Store.money(o.total)}</td></tr>`).join("");
  Factura.mostrar(`
    <div class="invoice">
      <div class="inv-head"><div><h2>${esc(MY_BIZ.nombre_negocio)}</h2><p>Reporte de ventas del ${esc(document.getElementById("salesDate").value)}</p></div></div>
      <table class="inv-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody>${filas || '<tr><td colspan="4">Sin pedidos en esta fecha</td></tr>'}</tbody></table>
      <div class="inv-totals">
        <div><span>Productos</span><span>${Store.money(r.productos)}</span></div>
        <div><span>Envíos</span><span>${Store.money(r.envios)}</span></div>
        <div class="inv-total"><span>Venta total</span><span>${Store.money(r.total)}</span></div>
      </div>
    </div>`);
}

/* ================= Insumos ================= */
function setupInsumos() {
  document.getElementById("addSupplyBtn").addEventListener("click", () => abrirFormInsumo(null));
  document.getElementById("supplyFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    SUPPLY_FILTER = chip.dataset.sfilter;
    document.querySelectorAll("#supplyFilters .chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderInsumos();
  });
  document.getElementById("shopCopy").addEventListener("click", copiarListaCompras);
  document.getElementById("shopPrint").addEventListener("click", imprimirListaCompras);
}

const fmtNum = (n) => Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
const estadoInsumo = (i) => (Number(i.cantidad) <= 0 ? "agotado" : Number(i.cantidad) <= Number(i.minimo) ? "faltante" : "ok");

async function cargarInsumos() {
  try {
    SUPPLIES = await Api.get("/insumos");
    const movs = await Api.get("/insumos/movimientos");
    renderMovimientos(movs);
  } catch (e) { showApiError(e); return; }
  renderInsumos();
}

function renderInsumos() {
  const faltantes = SUPPLIES.filter((i) => estadoInsumo(i) !== "ok");
  document.getElementById("scTodos").textContent = SUPPLIES.length;
  document.getElementById("scFaltantes").textContent = faltantes.length;
  document.getElementById("scAgotados").textContent = SUPPLIES.filter((i) => estadoInsumo(i) === "agotado").length;
  const badge = document.getElementById("navInsumosBadge");
  badge.textContent = faltantes.length;
  badge.hidden = faltantes.length === 0;

  const visibles = SUPPLY_FILTER === "todos" ? SUPPLIES
    : SUPPLY_FILTER === "faltantes" ? faltantes : SUPPLIES.filter((i) => estadoInsumo(i) === "agotado");
  const vacio = document.getElementById("supplyEmpty");
  vacio.hidden = visibles.length > 0;
  vacio.textContent = SUPPLIES.length ? "No hay insumos en esta lista." : "Aún no tienes insumos. Agrega el primero para llevar el control.";
  document.getElementById("supplyTable").hidden = visibles.length === 0;

  const etiqueta = { ok: ["Suficiente", "ok"], faltante: ["Por reponer", "low"], agotado: ["Agotado", "out"] };
  document.querySelector("#supplyTable tbody").innerHTML = visibles.map((i) => {
    const [txt, cls] = etiqueta[estadoInsumo(i)];
    return `<tr>
      <td><strong>${esc(i.nombre)}</strong></td>
      <td>${fmtNum(i.cantidad)} ${esc(i.unidad)}</td>
      <td>${fmtNum(i.minimo)} ${esc(i.unidad)}</td>
      <td><span class="stock-tag ${cls === "ok" ? "" : cls}">${txt}</span></td>
      <td class="num actions-cell">
        <button class="row-btn" data-in="${i.id}">Entrada</button>
        <button class="row-btn" data-out="${i.id}">Salida</button>
        <button class="row-btn" data-sedit="${i.id}">Editar</button>
        <button class="row-btn danger" data-sdel="${i.id}">Quitar</button>
      </td></tr>`;
  }).join("");

  const tbody = document.querySelector("#supplyTable tbody");
  const porId = (id) => SUPPLIES.find((i) => i.id === Number(id));
  tbody.querySelectorAll("[data-in]").forEach((b) => b.addEventListener("click", () => abrirMovimiento(porId(b.dataset.in), "entrada")));
  tbody.querySelectorAll("[data-out]").forEach((b) => b.addEventListener("click", () => abrirMovimiento(porId(b.dataset.out), "salida")));
  tbody.querySelectorAll("[data-sedit]").forEach((b) => b.addEventListener("click", () => abrirFormInsumo(porId(b.dataset.sedit))));
  tbody.querySelectorAll("[data-sdel]").forEach((b) => b.addEventListener("click", async () => {
    const i = porId(b.dataset.sdel);
    if (!confirm(`¿Quitar "${i.nombre}" del inventario? También se borra su historial.`)) return;
    try { await Api.del(`/insumos/${i.id}`); await cargarInsumos(); toast("Insumo eliminado"); } catch (e) { showApiError(e); }
  }));

  renderListaCompras(faltantes);
}

function sugerido(i) {
  return Math.max(Number(i.minimo) * 2 - Number(i.cantidad), 0);
}

function renderListaCompras(faltantes) {
  document.getElementById("shopList").innerHTML = faltantes.length
    ? faltantes.map((i) => `<li><span>${esc(i.nombre)}</span><b>${fmtNum(sugerido(i))} ${esc(i.unidad)}</b></li>`).join("")
    : '<li class="empty-state">No falta nada por ahora.</li>';
}

function renderMovimientos(movs) {
  document.getElementById("moveList").innerHTML = movs.length
    ? movs.slice(0, 10).map((m) => {
      const f = new Date(String(m.fecha).replace(" ", "T"));
      return `<li><span class="mv ${m.tipo}">${m.tipo === "entrada" ? "+" : "-"}${fmtNum(m.cantidad)} ${esc(m.unidad)}</span> ${esc(m.nombre)}
        <small>${f.toLocaleDateString("es-CO")} ${f.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}${m.motivo ? " - " + esc(m.motivo) : ""}</small></li>`;
    }).join("")
    : '<li class="empty-state">Aún no hay movimientos.</li>';
}

function textoListaCompras() {
  const faltantes = SUPPLIES.filter((i) => estadoInsumo(i) !== "ok");
  return `Lista de compras - ${MY_BIZ.nombre_negocio}\n` + faltantes.map((i) => `- ${i.nombre}: ${fmtNum(sugerido(i))} ${i.unidad}`).join("\n");
}

async function copiarListaCompras() {
  if (!SUPPLIES.some((i) => estadoInsumo(i) !== "ok")) { toast("No hay nada por comprar"); return; }
  try {
    await navigator.clipboard.writeText(textoListaCompras());
    toast("Lista copiada, pégala en WhatsApp o donde quieras");
  } catch (e) {
    toast("No se pudo copiar. Usa Imprimir.");
  }
}

function imprimirListaCompras() {
  const faltantes = SUPPLIES.filter((i) => estadoInsumo(i) !== "ok");
  Factura.mostrar(`
    <div class="invoice">
      <div class="inv-head"><div><h2>${esc(MY_BIZ.nombre_negocio)}</h2><p>Lista de compras - ${new Date().toLocaleDateString("es-CO")}</p></div></div>
      <table class="inv-table"><thead><tr><th>Insumo</th><th class="num">Hay</th><th class="num">Comprar</th></tr></thead><tbody>
        ${faltantes.map((i) => `<tr><td>${esc(i.nombre)}</td><td class="num">${fmtNum(i.cantidad)} ${esc(i.unidad)}</td><td class="num">${fmtNum(sugerido(i))} ${esc(i.unidad)}</td></tr>`).join("") || '<tr><td colspan="3">No falta nada por ahora</td></tr>'}
      </tbody></table></div>`);
}

function abrirFormInsumo(ins) {
  const editando = Boolean(ins);
  const campos = [
    { name: "nombre", label: "Nombre del insumo", value: ins?.nombre, attrs: 'maxlength="100" required' },
    { name: "unidad", label: "Unidad (kg, litros, unidades...)", value: ins?.unidad || "kg", attrs: 'maxlength="20" required' },
  ];
  if (!editando) campos.push({ name: "cantidad", label: "Cantidad disponible", type: "number", value: 0, attrs: 'min="0" step="0.01"' });
  campos.push({ name: "minimo", label: "Mínimo antes de reponer", type: "number", value: ins ? Number(ins.minimo) : 0, attrs: 'min="0" step="0.01"' });
  abrirModal(editando ? "Editar insumo" : "Nuevo insumo", campos, editando ? "Guardar cambios" : "Agregar insumo", async (d) => {
    if (!d.nombre) return "Escribe el nombre del insumo.";
    if (!d.unidad) return "Escribe la unidad.";
    if (Number(d.minimo) < 0 || (!editando && Number(d.cantidad) < 0)) return "Las cantidades no pueden ser negativas.";
    const cuerpo = { nombre: d.nombre, unidad: d.unidad, minimo: d.minimo || 0 };
    if (editando) await Api.put(`/insumos/${ins.id}`, cuerpo);
    else await Api.post("/insumos", { ...cuerpo, cantidad: d.cantidad || 0 });
    await cargarInsumos();
    toast(editando ? "Insumo actualizado" : "Insumo agregado");
  });
}

function abrirMovimiento(ins, tipo) {
  const entrada = tipo === "entrada";
  abrirModal(`${entrada ? "Entrada" : "Salida"} de ${ins.nombre}`, [
    { name: "cantidad", label: `Cantidad (${ins.unidad}). Hay ${fmtNum(ins.cantidad)}`, type: "number", value: "", attrs: 'min="0.01" step="0.01" required' },
    { name: "motivo", label: entrada ? "Motivo (ej: compra en la plaza)" : "Motivo (ej: se dañó, uso en cocina)", value: "", attrs: 'maxlength="120"' },
  ], "Registrar", async (d) => {
    const cantidad = Number(d.cantidad);
    if (!(cantidad > 0)) return "Escribe una cantidad mayor a cero.";
    if (!entrada && cantidad > Number(ins.cantidad)) return `No puedes sacar más de lo que hay (${fmtNum(ins.cantidad)}).`;
    await Api.post("/insumos/movimientos", { insumo_id: ins.id, tipo, cantidad, motivo: d.motivo });
    await cargarInsumos();
    await renderInicio();
    toast(entrada ? "Entrada registrada" : "Salida registrada");
  });
}

/* ================= Promociones ================= */
let PROMOS = [];

function fechaCorta(texto) {
  const d = new Date(String(texto).replace(" ", "T"));
  return isNaN(d) ? "" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function estadoPromo(p) {
  if (Number(p.vigente) === 1) return ["Activa", "activa"];
  if (Number(p.vencida) === 1) return ["Vencida", "inactiva"];
  if (p.estado === "inactivo") return ["Pausada", "inactiva"];
  return ["Agotada", "inactiva"];
}

async function renderPromociones() {
  try {
    PROMOS = await Api.get(`/promociones?negocio_id=${SESSION.id}`);
  } catch (e) { showApiError(e); return; }

  const conPromo = ORDERS.filter((o) => o.estado !== "cancelado" && Number(o.descuento) > 0);
  const ahorro = conPromo.reduce((s, o) => s + Number(o.descuento), 0);
  document.getElementById("promoSummary").innerHTML = [
    ["Promociones activas", PROMOS.filter((p) => Number(p.vigente) === 1).length],
    ["Pedidos con promoción", conPromo.length],
    ["Descuento entregado", Store.money(ahorro)],
    ["Ventas con promoción", Store.money(conPromo.reduce((s, o) => s + Number(o.total), 0))],
  ].map(([t, v]) => `<div class="stat-card"><span class="stat-label">${t}</span><strong>${v}</strong></div>`).join("");

  const list = document.getElementById("promosList");
  if (!PROMOS.length) {
    list.innerHTML = '<p class="empty-state">Aún no has creado promociones. Prueba con un cupón de bienvenida.</p>';
    return;
  }
  list.innerHTML = PROMOS.map((p) => {
    const [txt, cls] = estadoPromo(p);
    const alcance = p.producto_id ? `en ${esc(p.nombre_producto || "un producto")}` : "en toda la tienda";
    const partes = [
      `${Number(p.descuento)}% ${alcance}`,
      Number(p.compra_minima) > 0 ? `desde ${Store.money(p.compra_minima)}` : "",
      `vence ${fechaCorta(p.fecha_fin)}`,
      `usos: ${p.usos}${p.usos_max ? " de " + p.usos_max : ""}`,
    ].filter(Boolean).join(" - ");
    const vigenteOPausable = Number(p.vencida) === 0;
    return `
      <div class="promo-row">
        <div>
          <h4>${esc(p.nombre)} <span class="promo-status ${cls}">${txt}</span>
            ${p.codigo ? `<span class="promo-code">Cupón ${esc(p.codigo)}</span>` : '<span class="promo-code auto">Automática</span>'}</h4>
          <p class="promo-meta">${partes}</p>
          ${p.descripcion ? `<p class="promo-meta">${esc(p.descripcion)}</p>` : ""}
        </div>
        <div class="promo-actions">
          ${p.codigo ? `<button class="small-toggle-btn" data-copy="${esc(p.codigo)}">Copiar código</button>` : ""}
          ${vigenteOPausable ? `<button class="small-toggle-btn" data-toggle="${p.id}" data-estado="${p.estado === "activo" ? "inactivo" : "activo"}">${p.estado === "activo" ? "Pausar" : "Activar"}</button>` : ""}
          <button class="small-toggle-btn" data-extend="${p.id}">Extender 7 días</button>
          <button class="small-toggle-btn danger" data-delete="${p.id}">Eliminar</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); toast("Código copiado"); } catch (e) { toast(`Código: ${btn.dataset.copy}`); }
  }));
  list.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await Api.put(`/promociones/${btn.dataset.toggle}`, { estado: btn.dataset.estado });
      await renderPromociones();
      toast(btn.dataset.estado === "activo" ? "Promoción activada" : "Promoción pausada");
    } catch (e) { showApiError(e); }
  }));
  list.querySelectorAll("[data-extend]").forEach((btn) => btn.addEventListener("click", async () => {
    try { await Api.put(`/promociones/${btn.dataset.extend}`, { extender: 7 }); await renderPromociones(); toast("Vigencia extendida 7 días"); } catch (e) { showApiError(e); }
  }));
  list.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("¿Eliminar esta promoción? Los pedidos que ya la usaron conservan su descuento.")) return;
    try { await Api.del(`/promociones/${btn.dataset.delete}`); await renderPromociones(); toast("Promoción eliminada"); } catch (e) { showApiError(e); }
  }));
}

function abrirFormPromo() {
  const productos = PRODUCTS.filter((p) => Number(p.activo) !== 0);
  abrirModal("Nueva promoción", [
    { name: "nombre", label: "Título", value: "", attrs: 'maxlength="80" placeholder="Ej: Viernes de jugos" required' },
    { name: "descripcion", label: "Detalle (opcional)", type: "textarea", value: "", attrs: 'maxlength="200"' },
    { name: "descuento", label: "Descuento (%)", type: "number", value: 10, attrs: 'min="1" max="90" step="1" required' },
    { name: "producto_id", label: "Aplica a", type: "select", value: "", options: [{ value: "", label: "Toda la tienda" }, ...productos.map((p) => ({ value: p.id, label: p.nombre_producto }))] },
    { name: "codigo", label: "Código de cupón (opcional)", value: "", attrs: 'maxlength="20" placeholder="Vacío = se aplica sola. Ej: LOCAL10" autocomplete="off"' },
    { name: "compra_minima", label: "Compra mínima (COP, opcional)", type: "number", value: "", attrs: 'min="0" step="500"' },
    { name: "dias", label: "Vigencia (días)", type: "number", value: 7, attrs: 'min="1" max="90" step="1" required' },
    { name: "usos_max", label: "Límite de usos (opcional)", type: "number", value: "", attrs: 'min="1" step="1"' },
  ], "Crear promoción", async (d) => {
    const descuento = Number(d.descuento);
    const dias = Number(d.dias);
    if (!d.nombre) return "Escribe el título de la promoción.";
    if (!(descuento >= 1 && descuento <= 90)) return "El descuento debe estar entre 1% y 90%.";
    if (!(dias >= 1 && dias <= 90)) return "La vigencia debe ser de 1 a 90 días.";
    if (d.codigo && !/^[A-Za-z0-9]{3,20}$/.test(d.codigo)) return "El código debe tener de 3 a 20 letras o números, sin espacios.";
    await Api.post("/promociones", { ...d });
    await renderPromociones();
    toast("Promoción creada");
  });
}

/* ================= Publicidad local ================= */
const PAQUETES = [
  { id: "basico", nombre: "Básico", precio: 30000, incluye: ["Aparece en la sección Patrocinados del inicio", "Etiqueta Patrocinado en tu tarjeta"] },
  { id: "principal", nombre: "Principal", precio: 50000, incluye: ["Todo lo del paquete Básico", "Una diapositiva propia en el banner del inicio"] },
  { id: "premium", nombre: "Premium", precio: 90000, incluye: ["Todo lo del paquete Principal", "Primer lugar en el inicio", "Etiqueta Destacado"] },
];
let CAMPANIAS = [];

function renderPaquetes() {
  const wrap = document.getElementById("adPackages");
  wrap.innerHTML = PAQUETES.map((p) => `
    <div class="ad-package">
      <h4>${p.nombre}</h4>
      <div class="price">${Store.money(p.precio)}<small>/día</small></div>
      <ul class="ad-includes">${p.incluye.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="btn btn-primary btn-block" data-pkg="${p.id}">Contratar</button>
    </div>`).join("");
  wrap.querySelectorAll("[data-pkg]").forEach((btn) => btn.addEventListener("click", () => abrirFormCampania(btn.dataset.pkg)));
}

async function cargarCampanias() {
  try { CAMPANIAS = await Api.get("/publicidad?mine=1"); } catch (e) { showApiError(e); return; }
  renderCampanias();
}

function estadoCampania(c) {
  if (c.estado === "cancelada") return ["Cancelada", "inactiva"];
  if (Number(c.finalizada) === 1) return ["Finalizada", "inactiva"];
  if (c.estado === "pausada") return ["Pausada", "inactiva"];
  return ["Activa", "activa"];
}

function renderCampanias() {
  document.getElementById("adEmpty").hidden = CAMPANIAS.length > 0;
  document.getElementById("adTable").hidden = CAMPANIAS.length === 0;
  document.querySelector("#adTable tbody").innerHTML = CAMPANIAS.map((c) => {
    const [txt, cls] = estadoCampania(c);
    const paquete = (PAQUETES.find((p) => p.id === c.paquete) || {}).nombre || c.paquete;
    const ctr = c.impresiones > 0 ? ` (${((c.clics / c.impresiones) * 100).toFixed(1)}%)` : "";
    const termino = Number(c.finalizada) === 1 || c.estado === "cancelada";
    return `<tr>
      <td><strong>${esc(c.titulo)}</strong><small class="cell-sub">Paquete ${esc(paquete)}</small></td>
      <td>${fechaCorta(c.fecha_inicio)} al ${fechaCorta(c.fecha_fin)}</td>
      <td><span class="promo-status ${cls}">${txt}</span></td>
      <td class="num">${c.impresiones}</td>
      <td class="num">${c.clics}${ctr}</td>
      <td class="num">${Store.money(c.costo_total)}</td>
      <td class="num actions-cell">
        ${termino ? "" : `<button class="row-btn" data-ad-toggle="${c.id}" data-estado="${c.estado === "pausada" ? "activa" : "pausada"}">${c.estado === "pausada" ? "Reanudar" : "Pausar"}</button>
        <button class="row-btn danger" data-ad-cancel="${c.id}">Cancelar</button>`}
      </td></tr>`;
  }).join("");
  const tbody = document.querySelector("#adTable tbody");
  tbody.querySelectorAll("[data-ad-toggle]").forEach((b) => b.addEventListener("click", async () => {
    try { await Api.put(`/publicidad/${b.dataset.adToggle}`, { estado: b.dataset.estado }); await cargarCampanias(); toast(b.dataset.estado === "activa" ? "Campaña reanudada" : "Campaña pausada"); } catch (e) { showApiError(e); }
  }));
  tbody.querySelectorAll("[data-ad-cancel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("¿Cancelar esta campaña? No se puede reactivar y no hay reembolso en esta demostración.")) return;
    try { await Api.put(`/publicidad/${b.dataset.adCancel}`, { estado: "cancelada" }); await cargarCampanias(); toast("Campaña cancelada"); } catch (e) { showApiError(e); }
  }));
}

function abrirFormCampania(paqueteId) {
  const pk = PAQUETES.find((p) => p.id === paqueteId);
  abrirModal(`Contratar paquete ${pk.nombre}`, [
    { name: "titulo", label: "Título del anuncio", value: MY_BIZ.nombre_negocio, attrs: 'maxlength="60" required' },
    { name: "mensaje", label: "Mensaje (lo que verá el cliente)", type: "textarea", value: "", attrs: 'maxlength="140" placeholder="Ej: Bandeja paisa y jugos naturales, a domicilio en 25 minutos" required' },
    { name: "dias", label: "Duración", type: "select", value: "7", options: [1, 3, 7, 14, 30].map((n) => ({ value: n, label: n === 1 ? "1 día" : `${n} días` })) },
  ], "Contratar", async (d) => {
    if (!d.titulo) return "Escribe el título del anuncio.";
    if (!d.mensaje) return "Escribe el mensaje del anuncio.";
    await Api.post("/publicidad", { paquete: pk.id, titulo: d.titulo, mensaje: d.mensaje, dias: Number(d.dias) });
    await cargarCampanias();
    toast("Campaña contratada. Ya se está mostrando");
  });
  // Muestra el costo total y se actualiza al cambiar la duración.
  const campo = document.getElementById("pm_dias");
  const nota = document.createElement("p");
  nota.className = "hint-text ad-cost";
  campo.closest(".pm-field").after(nota);
  const pintar = () => { nota.textContent = `Total: ${Store.money(pk.precio * Number(campo.value))}. Pago simulado para la demostración.`; };
  campo.addEventListener("change", pintar);
  pintar();
}

/* ================= Soporte (demostración) ================= */
function setupSoporte() {
  document.getElementById("ticketBtn").addEventListener("click", () => toast("Ticket de soporte creado (demostración)"));
  document.getElementById("chatBtn").addEventListener("click", () => toast("Conectando con un asesor (demostración)"));
}
