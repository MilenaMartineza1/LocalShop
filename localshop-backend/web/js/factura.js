/* ============================================
   Comprobante (factura) de un pedido, para el cliente y para el negocio.
   Se muestra en una ventana y se imprime o guarda como PDF desde el navegador.
   ============================================ */
const Factura = {
  numero(pedido) {
    return "LS-" + String(pedido.id).padStart(6, "0");
  },

  _fecha(texto) {
    const d = new Date(String(texto).replace(" ", "T"));
    return isNaN(d) ? "" : d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) +
      ", " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  },

  html(pedido) {
    const envio = Number(pedido.costo_envio) || 0;
    const descuento = Number(pedido.descuento) || 0;
    const subtotal = Number(pedido.total) - envio + descuento;
    const filas = (pedido.detalle || []).map((d) => `
      <tr>
        <td>${esc(d.nombre_producto)}${d.nota ? `<small>Nota: ${esc(d.nota)}</small>` : ""}</td>
        <td class="num">${d.cantidad}</td>
        <td class="num">${Store.money(d.precio_unitario)}</td>
        <td class="num">${Store.money(d.precio_total)}</td>
      </tr>`).join("");
    const anulado = pedido.estado === "cancelado" ? '<p class="inv-void">PEDIDO CANCELADO</p>' : "";

    return `
      <div class="invoice" id="invoiceDoc">
        <div class="inv-head">
          <div>
            <h2>${esc(pedido.nombre_negocio)}</h2>
            <p>${esc(pedido.negocio_direccion || "")}</p>
            <p>${pedido.negocio_telefono ? "Tel. " + esc(pedido.negocio_telefono) : ""}</p>
          </div>
          <div class="inv-num">
            <strong>Comprobante ${Factura.numero(pedido)}</strong>
            <span>${Factura._fecha(pedido.fecha_creacion)}</span>
          </div>
        </div>
        ${anulado}
        <div class="inv-client">
          <div><span>Cliente</span><strong>${esc(pedido.cliente_nombre || "")}</strong></div>
          <div><span>Correo</span>${esc(pedido.cliente_correo || "-")}</div>
          <div><span>Teléfono</span>${esc(pedido.cliente_telefono || "-")}</div>
          <div><span>Entrega en</span>${esc(pedido.direccion_entrega || "-")}</div>
          <div><span>Forma de pago</span>${esc(pedido.metodo_pago || "-")}</div>
        </div>
        <table class="inv-table">
          <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div class="inv-totals">
          <div><span>Subtotal</span><span>${Store.money(subtotal)}</span></div>
          ${descuento > 0 ? `<div><span>Descuento${pedido.promo_nombre ? " (" + esc(pedido.promo_nombre) + ")" : ""}</span><span>-${Store.money(descuento)}</span></div>` : ""}
          <div><span>Envío</span><span>${envio > 0 ? Store.money(envio) : "Gratis"}</span></div>
          <div class="inv-total"><span>Total</span><span>${Store.money(pedido.total)}</span></div>
        </div>
        ${pedido.nota ? `<p class="inv-note">Nota del pedido: ${esc(pedido.nota)}</p>` : ""}
        <p class="inv-legal">Comprobante generado por LocalShop. No reemplaza la factura electrónica de venta exigida por la DIAN.</p>
      </div>`;
  },

  abrir(pedido) {
    Factura.mostrar(Factura.html(pedido));
  },

  /** Muestra cualquier documento (comprobante o reporte) en la ventana imprimible. */
  mostrar(documentoHtml) {
    Factura.cerrar();
    const overlay = document.createElement("div");
    overlay.className = "invoice-overlay";
    overlay.id = "invoiceOverlay";
    overlay.innerHTML = `
      <div class="invoice-window" role="dialog" aria-label="Comprobante del pedido">
        <div class="invoice-toolbar">
          <button class="btn btn-primary" data-inv-print>Imprimir o guardar PDF</button>
          <button class="btn btn-outline" data-inv-close>Cerrar</button>
        </div>
        ${documentoHtml}
      </div>`;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-inv-close]")) Factura.cerrar();
      if (e.target.closest("[data-inv-print]")) window.print();
    });
    document.body.appendChild(overlay);
    document.body.classList.add("invoice-open");
  },

  cerrar() {
    const previo = document.getElementById("invoiceOverlay");
    if (previo) previo.remove();
    document.body.classList.remove("invoice-open");
  },
};
window.Factura = Factura;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") Factura.cerrar(); });
