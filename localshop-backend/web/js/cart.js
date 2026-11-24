/* ============================================
   LocalShop - Carrito compartido
   Lo usan el inicio, la ficha del negocio y el perfil:
   - Cart:         estado del carrito (viene de MySQL), panel lateral y confirmación del pedido
   - ProductModal: ventana del producto con cantidad y nota para el negocio
   ============================================ */

const MAX_NOTA = 200;

const Cart = {
  items: [],
  _editingLine: null,
  _ready: false,

  async init() {
    if (Cart._ready) return;
    Cart._ready = true;
    Cart._injectDom();
    Cart._bindTriggers();
    try { await Cart.refresh(); } catch (e) { /* si falla, el carrito queda vacío y el resto de la página sigue */ }
  },

  /* ---------- Estado ---------- */
  async refresh() {
    Cart.items = await Api.get("/carrito");
    const count = Cart.count();
    setCartBadge(count);

    const floating = document.getElementById("floatingCart");
    if (floating) {
      floating.classList.toggle("hidden", count === 0);
      const c = document.getElementById("floatingCartCount");
      const t = document.getElementById("floatingCartTotal");
      if (c) c.textContent = count;
      if (t) t.textContent = Store.money(Cart.items.reduce((s, i) => s + i.precio * i.cantidad, 0));
    }
    if (document.getElementById("cartDrawer").classList.contains("open")) Cart._renderDrawer();
    document.dispatchEvent(new CustomEvent("cart:changed"));
    return Cart.items;
  },

  count() {
    return Cart.items.reduce((sum, i) => sum + i.cantidad, 0);
  },

  forBusiness(negocioId) {
    return Cart.items.filter((i) => i.negocio_id === Number(negocioId));
  },

  groups() {
    const map = new Map();
    Cart.items.forEach((item) => {
      if (!map.has(item.negocio_id)) {
        map.set(item.negocio_id, {
          id: item.negocio_id,
          nombre: item.nombre_negocio,
          envio: Number(item.costo_envio) || 0,
          minimo: Number(item.pedido_minimo) || 0,
          tiempo: item.tiempo_entrega_min || 30,
          lines: [],
        });
      }
      map.get(item.negocio_id).lines.push(item);
    });
    return [...map.values()];
  },

  /* ---------- Operaciones ---------- */
  async add(productoId, cantidad = 1, nota = "") {
    await Api.post("/carrito", { productos_id: productoId, cantidad, nota });
    await Cart.refresh();
  },
  async setQty(lineId, cantidad) {
    await Api.put(`/carrito/${lineId}`, { cantidad });
    await Cart.refresh();
  },
  async setNote(lineId, nota) {
    await Api.put(`/carrito/${lineId}`, { nota });
    await Cart.refresh();
  },

  /* ---------- Panel lateral ---------- */
  open() {
    Cart._renderDrawer();
    document.getElementById("cartDrawer").classList.add("open");
    document.getElementById("cartOverlay").classList.add("open");
  },
  close() {
    document.getElementById("cartDrawer").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
    Cart._editingLine = null;
  },

  _renderDrawer() {
    const body = document.getElementById("cartBody");
    const groups = Cart.groups();
    if (!groups.length) {
      body.innerHTML = '<p class="cart-empty">Tu carrito está vacío. Explora un negocio para empezar a comprar.</p>';
      return;
    }
    body.innerHTML = groups.map((g) => Cart._groupHtml(g)).join("");
  },

  _groupHtml(g) {
    const subtotal = g.lines.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const faltante = g.minimo - subtotal;
    const lines = g.lines.map((item) => {
      const editando = Cart._editingLine === item.id;
      const nota = item.nota
        ? `<span class="cart-line-note">${esc(item.nota)}</span>`
        : "";
      const editor = editando
        ? `<div class="cart-note-editor">
             <textarea maxlength="${MAX_NOTA}" data-note-input="${item.id}" placeholder="${esc(ejemploNota(item.categoria_nombre))}">${esc(item.nota)}</textarea>
             <div class="cart-note-actions">
               <button class="btn btn-primary" style="padding:6px 14px;font-size:12px" data-note-save="${item.id}">Guardar</button>
               <button class="btn btn-outline" style="padding:6px 14px;font-size:12px" data-note-cancel="1">Cancelar</button>
             </div>
           </div>`
        : `<button class="link-btn" data-note-edit="${item.id}">${item.nota ? "Editar nota" : "Agregar nota"}</button>`;
      return `
        <div class="cart-line">
          ${Img.producto(item)}
          <div class="cart-line-info">
            <h5>${esc(item.nombre_producto)}</h5>
            <span class="cart-line-price">${Store.money(item.precio)} c/u</span>
            ${editando ? "" : nota}
            ${editor}
          </div>
          <div class="qty-stepper">
            <button class="step-btn minus" data-qty-line="${item.id}" data-qty-to="${item.cantidad - 1}" aria-label="Quitar uno">−</button>
            <span class="step-qty">${item.cantidad}</span>
            <button class="step-btn plus" data-qty-line="${item.id}" data-qty-to="${item.cantidad + 1}" aria-label="Agregar uno">+</button>
          </div>
        </div>`;
    }).join("");

    return `
      <section class="cart-group">
        <div class="cart-group-head">
          <a href="negocio.html?id=${g.id}">${esc(g.nombre)}</a>
          <span>Entrega ${g.tiempo} min</span>
        </div>
        ${lines}
        <div class="cart-summary">
          <div><span>Subtotal</span><span>${Store.money(subtotal)}</span></div>
          <div><span>Envío</span><span>${g.envio > 0 ? Store.money(g.envio) : "Gratis"}</span></div>
          <div class="total"><span>Total</span><strong>${Store.money(subtotal + g.envio)}</strong></div>
        </div>
        ${faltante > 0 ? `<p class="cart-warning">Te faltan ${Store.money(faltante)} para el pedido mínimo de ${Store.money(g.minimo)}.</p>` : ""}
        <button class="btn btn-accent btn-block" data-checkout="${g.id}" ${faltante > 0 ? "disabled" : ""}>Pedir en ${esc(g.nombre)}</button>
      </section>`;
  },

  /* ---------- Confirmación del pedido ---------- */
  async openCheckout(negocioId) {
    const group = Cart.groups().find((g) => g.id === Number(negocioId));
    if (!group) return;
    const subtotal = group.lines.reduce((s, i) => s + i.precio * i.cantidad, 0);

    let config = {};
    try { config = await Api.get("/configuracion"); } catch (e) { /* sin configuración guardada */ }
    let guardadas = [];
    try { guardadas = await Api.get("/direcciones"); } catch (e) { /* sin direcciones guardadas */ }

    const metodos = [
      ["efectivo", "Efectivo contraentrega"],
      ["PSE", "PSE"],
      ["Tarjeta de credito o debito", "Tarjeta de crédito o débito"],
    ];
    const lineas = group.lines.map((i) =>
      `<div><span>${i.cantidad} x ${esc(i.nombre_producto)}${i.nota ? `<small>Nota: ${esc(i.nota)}</small>` : ""}</span><span>${Store.money(i.precio * i.cantidad)}</span></div>`
    ).join("");

    // El total con descuento lo calcula el servidor; aquí solo se muestra.
    let cotizacion = null;
    let codigoAplicado = "";
    const cotizar = async (codigo) => {
      try {
        cotizacion = await Api.post("/pedidos/cotizar", { negocios_id: group.id, codigo: codigo || "" });
      } catch (e) { cotizacion = null; }
    };
    await cotizar("");

    const box = document.getElementById("checkoutBody");
    box.innerHTML = `
      <h3>Confirmar pedido</h3>
      <p class="modal-desc">${esc(group.nombre)} · entrega estimada ${group.tiempo} min</p>
      <div class="checkout-lines">
        ${lineas}
        <div id="coDiscount" class="discount-line" hidden><span></span><span></span></div>
        <div><span>Envío</span><span>${group.envio > 0 ? Store.money(group.envio) : "Gratis"}</span></div>
        <div class="total"><span>Total</span><span id="coTotal">${Store.money(subtotal + group.envio)}</span></div>
      </div>
      <label class="field-label" for="coCoupon">Cupón de descuento (opcional)</label>
      <div class="coupon-row">
        <input class="input-field" id="coCoupon" maxlength="20" placeholder="Código" autocomplete="off">
        <button class="btn btn-outline" type="button" id="coApply">Aplicar</button>
      </div>
      <p id="coCouponMsg" hidden></p>
      ${guardadas.length ? `
      <label class="field-label" for="coSaved">Mis direcciones</label>
      <select class="input-field" id="coSaved">
        <option value="">Escribir otra dirección</option>
        ${guardadas.map((d) => `<option value="${d.id}">${esc(d.etiqueta)} - ${esc(d.direccion)}</option>`).join("")}
      </select>` : ""}
      <label class="field-label" for="coAddress">Dirección de entrega</label>
      <textarea class="input-field" id="coAddress" rows="2" maxlength="250" placeholder="Calle, número, barrio y referencias">${esc(config.direccion || "")}</textarea>
      <label class="field-label" for="coPay">Método de pago</label>
      <select class="input-field" id="coPay">
        ${metodos.map(([v, l]) => `<option value="${esc(v)}" ${config.metodo_pago === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <label class="field-label" for="coNote">Nota para todo el pedido (opcional)</label>
      <input class="input-field" id="coNote" maxlength="${MAX_NOTA}" placeholder="Ej: tocar el timbre, dejar en portería">
      <p class="modal-error" id="coError" hidden></p>
      <button class="btn btn-accent btn-block" id="coConfirm" style="margin-top:14px">Confirmar pedido</button>`;

    document.getElementById("checkoutOverlay").classList.add("open");

    const pintarTotales = () => {
      const fila = document.getElementById("coDiscount");
      const total = document.getElementById("coTotal");
      if (cotizacion && cotizacion.descuento > 0) {
        fila.hidden = false;
        fila.children[0].textContent = `Descuento: ${cotizacion.promo_nombre}`;
        fila.children[1].textContent = "-" + Store.money(cotizacion.descuento);
        total.textContent = Store.money(cotizacion.total);
      } else {
        fila.hidden = true;
        total.textContent = Store.money(subtotal + group.envio);
      }
    };
    pintarTotales();
    const msg = document.getElementById("coCouponMsg");
    const decir = (texto, ok) => { msg.hidden = !texto; msg.textContent = texto || ""; msg.className = ok ? "coupon-ok" : "coupon-bad"; };
    if (cotizacion && cotizacion.descuento > 0) decir(`Promoción aplicada: ${cotizacion.promo_nombre}`, true);

    document.getElementById("coApply").addEventListener("click", async () => {
      const codigo = document.getElementById("coCoupon").value.trim();
      if (!codigo) { decir("Escribe el código del cupón.", false); return; }
      await cotizar(codigo);
      if (!cotizacion) { decir("No se pudo validar el cupón. Intenta de nuevo.", false); return; }
      if (cotizacion.codigo_error) {
        codigoAplicado = "";
        decir(cotizacion.codigo_error, false);
      } else {
        codigoAplicado = cotizacion.codigo || "";
        decir(cotizacion.aviso || (cotizacion.codigo ? `Cupón ${cotizacion.codigo} aplicado` : "Ese cupón no mejora tu descuento actual"), Boolean(cotizacion.codigo) || Boolean(cotizacion.aviso));
      }
      pintarTotales();
    });
    const selector = document.getElementById("coSaved");
    if (selector) {
      selector.addEventListener("change", () => {
        const d = guardadas.find((x) => x.id === Number(selector.value));
        if (d) document.getElementById("coAddress").value = d.direccion;
      });
    }
    box.addEventListener("input", () => { document.getElementById("coError").hidden = true; });

    document.getElementById("coConfirm").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const err = document.getElementById("coError");
      const direccion = document.getElementById("coAddress").value.trim();
      const metodo = document.getElementById("coPay").value;
      err.hidden = true;
      if (direccion.length < 5) {
        err.textContent = "Escribe la dirección de entrega.";
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = "Enviando pedido...";
      try {
        await Api.post("/pedidos", {
          negocios_id: group.id,
          direccion_entrega: direccion,
          metodo_pago: metodo,
          nota: document.getElementById("coNote").value.trim(),
          codigo: codigoAplicado,
        });
        if (!config.direccion) {
          Api.put("/configuracion", { direccion, metodo_pago: metodo, preferencias: config.preferencias || "{}" }).catch(() => {});
        }
        document.getElementById("checkoutOverlay").classList.remove("open");
        Cart.close();
        await Cart.refresh();
        toast(`Pedido enviado a ${group.nombre}`);
        if (!location.pathname.endsWith("perfil.html")) {
          setTimeout(() => (window.location.href = "perfil.html"), 1100);
        } else {
          document.dispatchEvent(new CustomEvent("orders:changed"));
        }
      } catch (e2) {
        err.textContent = e2.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Confirmar pedido";
      }
    });
  },

  /* ---------- DOM ---------- */
  _injectDom() {
    const html = `
      <div class="cart-drawer-overlay" id="cartOverlay"></div>
      <aside class="cart-drawer" id="cartDrawer" aria-label="Carrito de compras">
        <div class="cart-drawer-head">
          <h3>Tu carrito</h3>
          <button class="cart-drawer-close" id="cartClose" aria-label="Cerrar carrito">&#10005;</button>
        </div>
        <div class="cart-drawer-body" id="cartBody"></div>
      </aside>
      <div class="modal-overlay" id="checkoutOverlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Confirmar pedido">
          <button class="modal-close" data-close-modal aria-label="Cerrar">&#10005;</button>
          <div class="modal-body" id="checkoutBody"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);

    document.getElementById("cartOverlay").addEventListener("click", Cart.close);
    document.getElementById("cartClose").addEventListener("click", Cart.close);
    document.getElementById("checkoutOverlay").addEventListener("click", (e) => {
      if (e.target.id === "checkoutOverlay" || e.target.closest("[data-close-modal]")) {
        document.getElementById("checkoutOverlay").classList.remove("open");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      document.getElementById("checkoutOverlay").classList.remove("open");
      Cart.close();
    });

    // Un solo listener para todo lo que hay dentro del panel
    document.getElementById("cartBody").addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      try {
        if (t.dataset.qtyLine) {
          await Cart.setQty(t.dataset.qtyLine, Number(t.dataset.qtyTo));
        } else if (t.dataset.noteEdit) {
          Cart._editingLine = Number(t.dataset.noteEdit);
          Cart._renderDrawer();
          const ta = document.querySelector(`[data-note-input="${t.dataset.noteEdit}"]`);
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        } else if (t.dataset.noteSave) {
          const ta = document.querySelector(`[data-note-input="${t.dataset.noteSave}"]`);
          Cart._editingLine = null;
          await Cart.setNote(t.dataset.noteSave, ta ? ta.value.trim() : "");
        } else if (t.dataset.noteCancel) {
          Cart._editingLine = null;
          Cart._renderDrawer();
        } else if (t.dataset.checkout) {
          Cart.openCheckout(t.dataset.checkout);
        }
      } catch (err) { showApiError(err); }
    });
  },

  _bindTriggers() {
    document.querySelectorAll(".cart-btn, .cart-icon-wrap, #floatingCart").forEach((el) => {
      el.addEventListener("click", Cart.open);
      if (el.tagName !== "BUTTON") {
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "Abrir carrito");
        el.style.cursor = "pointer";
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); Cart.open(); } });
      }
    });
  },
};

/* ============================================
   Ventana del producto: cantidad + nota para el negocio
   ============================================ */
const EJEMPLOS_NOTA = {
  restaurantes: "Ej: sin cebolla, con adición de queso, bien cocido",
  supermercados: "Ej: fruta madura, cambiar por otra marca si no hay",
  farmacia: "Ej: presentación en tabletas, revisar fecha de vencimiento",
  mascotas: "Ej: para perro adulto, bolsa pequeña",
  licores: "Ej: bien frío, empacar para regalo",
  flores: "Ej: tarjeta con dedicatoria, entregar antes del mediodía",
  tecnologia: "Ej: color negro, incluir factura de compra",
  moda: "Ej: talla M, color azul",
  default: "Ej: indicación especial para este producto",
};

function ejemploNota(categoria) {
  return EJEMPLOS_NOTA[Visual.clave(categoria)] || EJEMPLOS_NOTA.default;
}

const ProductModal = {
  _el: null,

  open(producto) {
    if (!ProductModal._el) ProductModal._create();
    const el = ProductModal._el;
    let cantidad = 1;

    el.querySelector(".modal").innerHTML = `
      <button class="modal-close" data-close-modal aria-label="Cerrar">&#10005;</button>
      ${Img.producto(producto).replace("<img ", '<img class="product-modal-img" ')}
      <div class="modal-body">
        <h3>${esc(producto.nombre_producto)}</h3>
        <p class="modal-desc">${esc(producto.descripcion_producto)}</p>
        <p class="modal-price">${Store.money(producto.precio)}</p>
        <label class="field-label" for="pmNote">Nota para el negocio (opcional)</label>
        <textarea class="input-field" id="pmNote" maxlength="${MAX_NOTA}" placeholder="${esc(ejemploNota(producto.categoria_nombre))}"></textarea>
        <div class="field-hint"><span>El negocio verá esta nota junto a tu pedido.</span><span id="pmCount">0/${MAX_NOTA}</span></div>
        <div class="modal-qty-row">
          <span style="font-weight:600">Cantidad</span>
          <div class="qty-stepper">
            <button class="step-btn minus" id="pmMinus" aria-label="Quitar uno">−</button>
            <span class="step-qty" id="pmQty">1</span>
            <button class="step-btn plus" id="pmPlus" aria-label="Agregar uno">+</button>
          </div>
        </div>
        <p class="modal-error" id="pmError" hidden></p>
        <button class="btn btn-accent btn-block" id="pmAdd"></button>
      </div>`;

    const qtyEl = el.querySelector("#pmQty");
    const addBtn = el.querySelector("#pmAdd");
    const noteEl = el.querySelector("#pmNote");
    const refreshTotals = () => {
      qtyEl.textContent = cantidad;
      addBtn.textContent = `Agregar al carrito · ${Store.money(producto.precio * cantidad)}`;
    };
    refreshTotals();

    el.querySelector("#pmMinus").addEventListener("click", () => { cantidad = Math.max(1, cantidad - 1); refreshTotals(); });
    el.querySelector("#pmPlus").addEventListener("click", () => { cantidad = Math.min(50, cantidad + 1); refreshTotals(); });
    noteEl.addEventListener("input", () => { el.querySelector("#pmCount").textContent = `${noteEl.value.length}/${MAX_NOTA}`; });

    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      try {
        await Cart.add(producto.id, cantidad, noteEl.value.trim());
        ProductModal.close();
        toast(`${producto.nombre_producto} agregado al carrito`);
      } catch (err) {
        const box = el.querySelector("#pmError");
        box.textContent = err.message;
        box.hidden = false;
        addBtn.disabled = false;
      }
    });

    el.classList.add("open");
    noteEl.focus();
  },

  close() {
    if (ProductModal._el) ProductModal._el.classList.remove("open");
  },

  _create() {
    const el = document.createElement("div");
    el.className = "modal-overlay";
    el.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Detalle del producto"></div>';
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest("[data-close-modal]")) ProductModal.close();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") ProductModal.close(); });
    document.body.appendChild(el);
    ProductModal._el = el;
  },
};

window.Cart = Cart;
window.ProductModal = ProductModal;
