package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * GET /api/pedidos            pedidos del cliente (o del negocio) autenticado, con su detalle y notas
 * POST /api/pedidos           { negocios_id, direccion_entrega, metodo_pago, nota }  confirma el carrito de ese negocio
 * PUT /api/pedidos/{id}       { estado }  solo el negocio dueño del pedido
 */
public class PedidosHandler implements HttpHandler {

    private static final List<String> FLUJO = List.of("pendiente", "enviado", "entregado");
    private static final Set<String> METODOS_PAGO = Set.of("efectivo", "PSE", "Tarjeta de credito o debito");

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            String metodo = exchange.getRequestMethod();
            switch (metodo) {
                case "GET" -> listar(exchange);
                case "POST" -> {
                    if (exchange.getRequestURI().getPath().endsWith("/cotizar")) cotizar(exchange);
                    else crear(exchange);
                }
                case "PUT" -> actualizarEstado(exchange);
                default -> HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void listar(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = Sesiones.validar(HttpUtil.token(exchange));
        if (sesion == null) {
            HttpUtil.sendJson(exchange, 401, HttpUtil.error("Tu sesión expiró. Inicia sesión de nuevo."));
            return;
        }
        String filtro = sesion.rol().equals("negocio") ? "p.negocios_id" : "p.usuarios_id";
        var pedidos = GenericDao.query(
                "SELECT p.*, n.nombre_negocio, n.imagen_url AS negocio_imagen, cat.nombre AS categoria_nombre, " +
                        "n.direccion AS negocio_direccion, n.telefono AS negocio_telefono, " +
                        "u.nombre_completo AS cliente_nombre, u.telefono AS cliente_telefono, u.correo AS cliente_correo, " +
                        "(SELECT rv.calificacion FROM reviews rv WHERE rv.pedido_id = p.id) AS resena_calificacion " +
                        "FROM pedidos p " +
                        "JOIN negocios n ON p.negocios_id = n.id " +
                        "JOIN usuarios u ON p.usuarios_id = u.id " +
                        "LEFT JOIN categorias cat ON n.categoria_id = cat.id " +
                        "WHERE " + filtro + " = ? ORDER BY p.fecha_creacion DESC, p.id DESC", sesion.id());

        for (var pedido : pedidos) {
            var detalle = GenericDao.query(
                    "SELECT dp.*, pr.nombre_producto, pr.imagen_url, c.nombre AS categoria_nombre " +
                            "FROM detalle_pedido dp " +
                            "JOIN productos pr ON dp.productos_id = pr.id " +
                            "LEFT JOIN categorias c ON pr.categoria_id = c.id " +
                            "WHERE dp.pedidos_id = ?", pedido.get("id"));
            pedido.put("detalle", detalle);
        }
        HttpUtil.sendJson(exchange, 200, pedidos);
    }

    private static List<PromoCalculo.Linea> lineasDe(List<Map<String, Object>> items) {
        List<PromoCalculo.Linea> lineas = new java.util.ArrayList<>();
        for (var i : items) {
            lineas.add(new PromoCalculo.Linea(((Number) i.get("productos_id")).intValue(),
                    ((Number) i.get("cantidad")).intValue(), ((Number) i.get("precio")).doubleValue()));
        }
        return lineas;
    }

    /** POST /api/pedidos/cotizar { negocios_id, codigo? }: muestra el total con descuento antes de confirmar. */
    private void cotizar(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
        if (sesion == null) return;
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int negocioId = Integer.parseInt(body.get("negocios_id"));
        Map<String, Object> negocio = GenericDao.queryOne(
                "SELECT costo_envio, pedido_minimo FROM negocios WHERE id = ? AND estado = 'activo'", negocioId);
        if (negocio == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Ese negocio no está disponible"));
            return;
        }
        List<Map<String, Object>> items = GenericDao.query(
                "SELECT c.productos_id, c.cantidad, p.precio FROM carrito c JOIN productos p ON c.productos_id = p.id " +
                        "WHERE c.usuarios_id = ? AND c.estado = 'pendiente' AND p.negocio_id = ?", sesion.id(), negocioId);
        PromoCalculo.Resultado r = PromoCalculo.calcular(negocioId, lineasDe(items), body.getOrDefault("codigo", ""));
        double envio = ((Number) negocio.get("costo_envio")).doubleValue();
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("subtotal", r.subtotal());
        out.put("descuento", r.descuento());
        out.put("envio", envio);
        out.put("total", r.subtotal() - r.descuento() + envio);
        out.put("promo_nombre", r.promoNombre());
        out.put("codigo", r.codigo());
        out.put("codigo_error", r.codigoError());
        out.put("aviso", r.aviso());
        HttpUtil.sendJson(exchange, 200, out);
    }

    private void crear(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
        if (sesion == null) return;
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int negocioId = Integer.parseInt(body.get("negocios_id"));
        String direccion = body.getOrDefault("direccion_entrega", "").trim();
        String metodoPago = body.getOrDefault("metodo_pago", "efectivo");
        String nota = body.getOrDefault("nota", "").trim();

        if (direccion.length() < 5) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Escribe la dirección de entrega"));
            return;
        }
        if (!METODOS_PAGO.contains(metodoPago)) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Método de pago no válido"));
            return;
        }
        if (nota.length() > 200) nota = nota.substring(0, 200);

        Map<String, Object> negocio = GenericDao.queryOne(
                "SELECT costo_envio, pedido_minimo, tiempo_entrega_min FROM negocios WHERE id = ? AND estado = 'activo'", negocioId);
        if (negocio == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Ese negocio no está disponible"));
            return;
        }

        List<Map<String, Object>> items = GenericDao.query(
                "SELECT c.id AS carrito_id, c.productos_id, c.cantidad, c.nota, p.precio, p.stock, p.nombre_producto, p.activo " +
                        "FROM carrito c JOIN productos p ON c.productos_id = p.id " +
                        "WHERE c.usuarios_id = ? AND c.estado = 'pendiente' AND p.negocio_id = ?",
                sesion.id(), negocioId);
        if (items.isEmpty()) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Tu carrito está vacío para este negocio"));
            return;
        }

        for (var item : items) {
            Object activo = item.get("activo"); // MySQL devuelve TINYINT(1) como Boolean
            if (Boolean.FALSE.equals(activo) || (activo instanceof Number n && n.intValue() == 0)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error(item.get("nombre_producto") + " ya no está disponible. Quítalo del carrito para continuar"));
                return;
            }
        }

        // Se suma lo pedido por producto (puede haber varias líneas con notas distintas) y se compara con el stock.
        Map<Object, Integer> pedidoPorProducto = new java.util.HashMap<>();
        for (var item : items) {
            pedidoPorProducto.merge(item.get("productos_id"), ((Number) item.get("cantidad")).intValue(), Integer::sum);
        }
        for (var item : items) {
            int stock = item.get("stock") == null ? 0 : ((Number) item.get("stock")).intValue();
            if (pedidoPorProducto.get(item.get("productos_id")) > stock) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error(stock <= 0
                        ? item.get("nombre_producto") + " está agotado. Quítalo del carrito para continuar"
                        : "De " + item.get("nombre_producto") + " solo quedan " + stock + " unidades"));
                return;
            }
        }

        double subtotal = 0;
        for (var item : items) {
            subtotal += ((Number) item.get("precio")).doubleValue() * ((Number) item.get("cantidad")).intValue();
        }
        double minimo = ((Number) negocio.get("pedido_minimo")).doubleValue();
        if (subtotal < minimo) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("El pedido mínimo de este negocio es $" + Math.round(minimo)));
            return;
        }
        double envio = ((Number) negocio.get("costo_envio")).doubleValue();
        int tiempo = ((Number) negocio.get("tiempo_entrega_min")).intValue();

        String codigo = body.getOrDefault("codigo", "").trim();
        PromoCalculo.Resultado promo = PromoCalculo.calcular(negocioId, lineasDe(items), codigo);
        if (!codigo.isEmpty() && promo.codigoError() != null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(promo.codigoError()));
            return;
        }
        if (promo.promoId() != null) {
            // Reserva un uso de forma atómica: si otro pedido agotó la promoción justo antes, no se aplica.
            int filas = GenericDao.execute(
                    "UPDATE promociones SET usos = usos + 1 WHERE id = ? AND (usos_max IS NULL OR usos < usos_max)", promo.promoId());
            if (filas == 0) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("La promoción se acaba de agotar. Revisa el total y confirma de nuevo"));
                return;
            }
        }
        double total = subtotal - promo.descuento() + envio;

        int pedidoId = GenericDao.update(
                "INSERT INTO pedidos (usuarios_id, negocios_id, estado, total, costo_envio, tiempo_entrega, direccion_entrega, metodo_pago, nota, " +
                        "descuento, promo_id, promo_nombre, codigo_promo) " +
                        "VALUES (?,?, 'pendiente', ?,?,?,?,?,?, ?,?,?,?)",
                sesion.id(), negocioId, total, envio, tiempo, direccion, metodoPago, nota,
                promo.descuento(), promo.promoId(), promo.promoNombre(), promo.codigo());

        for (var item : items) {
            double precio = ((Number) item.get("precio")).doubleValue();
            int cantidad = ((Number) item.get("cantidad")).intValue();
            GenericDao.update(
                    "INSERT INTO detalle_pedido (pedidos_id, productos_id, cantidad, precio_unitario, precio_total, nota) VALUES (?,?,?,?,?,?)",
                    pedidoId, item.get("productos_id"), cantidad, precio, precio * cantidad, item.get("nota"));
            GenericDao.execute("UPDATE productos SET stock = GREATEST(stock - ?, 0) WHERE id = ?", cantidad, item.get("productos_id"));
            GenericDao.update("UPDATE carrito SET estado = 'comprado' WHERE id = ?", item.get("carrito_id"));
        }

        HttpUtil.sendJson(exchange, 201, Map.of("id", pedidoId, "total", total));
    }

    private void actualizarEstado(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = Sesiones.validar(HttpUtil.token(exchange));
        if (sesion == null) {
            HttpUtil.sendJson(exchange, 401, HttpUtil.error("Tu sesión expiró. Inicia sesión de nuevo."));
            return;
        }
        boolean esNegocio = sesion.rol().equals("negocio");
        Integer pedidoId = HttpUtil.pathId(exchange);
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nuevoEstado = body.get("estado");

        Map<String, Object> actual = GenericDao.queryOne(
                "SELECT estado FROM pedidos WHERE id = ? AND " + (esNegocio ? "negocios_id" : "usuarios_id") + " = ?",
                pedidoId, sesion.id());
        if (actual == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Pedido no encontrado"));
            return;
        }
        String estadoActual = (String) actual.get("estado");

        if ("cancelado".equals(nuevoEstado)) {
            // Cliente o negocio pueden cancelar, pero solo mientras el pedido no haya salido.
            if (!estadoActual.equals("pendiente")) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Solo se puede cancelar un pedido que aún se está preparando"));
                return;
            }
            // El UPDATE condicionado evita devolver el stock dos veces si llegan dos cancelaciones a la vez.
            if (GenericDao.execute("UPDATE pedidos SET estado = 'cancelado' WHERE id = ? AND estado = 'pendiente'", pedidoId) == 1) {
                GenericDao.execute(
                        "UPDATE productos p JOIN detalle_pedido d ON d.productos_id = p.id " +
                                "SET p.stock = p.stock + d.cantidad WHERE d.pedidos_id = ?", pedidoId);
                GenericDao.execute(
                        "UPDATE promociones SET usos = GREATEST(usos - 1, 0) " +
                                "WHERE id = (SELECT promo_id FROM (SELECT promo_id FROM pedidos WHERE id = ?) t)", pedidoId);
                GenericDao.update(
                        "INSERT INTO historial_pedido (pedido_id, estado_anterior, estado_nuevo) VALUES (?, 'pendiente', 'cancelado')", pedidoId);
            }
            HttpUtil.sendJson(exchange, 200, Map.of("id", pedidoId, "estado", "cancelado"));
            return;
        }

        if (!esNegocio) {
            HttpUtil.sendJson(exchange, 403, HttpUtil.error("No tienes permiso para esta acción"));
            return;
        }
        int desde = FLUJO.indexOf(estadoActual);
        int hacia = FLUJO.indexOf(nuevoEstado);
        if (desde < 0 || hacia != desde + 1) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("El pedido solo puede avanzar al siguiente estado"));
            return;
        }

        GenericDao.update("UPDATE pedidos SET estado = ? WHERE id = ?", nuevoEstado, pedidoId);
        GenericDao.update(
                "INSERT INTO historial_pedido (pedido_id, estado_anterior, estado_nuevo) VALUES (?,?,?)",
                pedidoId, estadoActual, nuevoEstado);

        HttpUtil.sendJson(exchange, 200, Map.of("id", pedidoId, "estado", nuevoEstado));
    }
}
