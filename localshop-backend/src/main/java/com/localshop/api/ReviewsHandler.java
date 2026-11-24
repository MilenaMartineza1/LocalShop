package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

/**
 * GET  /api/reviews?negocio_id=   reseñas de un negocio
 * GET  /api/reviews?recientes=3   últimas reseñas con comentario (para la página de inicio)
 * POST /api/reviews               { productos_id, calificacion, comentario }  solo clientes con sesión
 */
public class ReviewsHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                crear(exchange);
            } else {
                listar(exchange);
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void listar(HttpExchange exchange) throws Exception {
        Map<String, String> qp = HttpUtil.parseQuery(exchange);
        if (qp.containsKey("recientes")) {
            int limite = Math.min(10, Math.max(1, Integer.parseInt(qp.get("recientes"))));
            var rows = GenericDao.query(
                    "SELECT r.calificacion, r.comentario, r.fecha_creacion, u.nombre_completo AS autor, " +
                            "n.id AS negocio_id, n.nombre_negocio " +
                            "FROM reviews r JOIN usuarios u ON r.usuarios_id = u.id " +
                            "JOIN negocios n ON r.negocio_id = n.id " +
                            "WHERE r.comentario IS NOT NULL AND r.comentario <> '' " +
                            "ORDER BY r.fecha_creacion DESC, r.id DESC LIMIT " + limite);
            HttpUtil.sendJson(exchange, 200, rows);
            return;
        }
        int negocioId = Integer.parseInt(qp.getOrDefault("negocio_id", "0"));
        var rows = GenericDao.query(
                "SELECT r.id, r.calificacion, r.comentario, r.fecha_creacion, u.nombre_completo AS autor FROM reviews r " +
                        "JOIN usuarios u ON r.usuarios_id = u.id " +
                        "WHERE r.negocio_id = ? ORDER BY r.fecha_creacion DESC, r.id DESC", negocioId);
        HttpUtil.sendJson(exchange, 200, rows);
    }

    private void crear(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
        if (sesion == null) return;
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int calificacion = Integer.parseInt(body.get("calificacion"));
        if (calificacion < 1 || calificacion > 5) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("La calificación debe estar entre 1 y 5"));
            return;
        }
        int pedidoId = Integer.parseInt(body.getOrDefault("pedido_id", "0"));
        String comentario = body.getOrDefault("comentario", "").trim();
        if (comentario.length() > 500) comentario = comentario.substring(0, 500);

        // Se califica al negocio, una sola vez por pedido y solo cuando ya fue entregado.
        Map<String, Object> pedido = GenericDao.queryOne(
                "SELECT negocios_id, estado FROM pedidos WHERE id = ? AND usuarios_id = ?", pedidoId, sesion.id());
        if (pedido == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Pedido no encontrado"));
            return;
        }
        if (!"entregado".equals(pedido.get("estado"))) {
            HttpUtil.sendJson(exchange, 403, HttpUtil.error("Podrás calificar cuando recibas el pedido"));
            return;
        }
        if (GenericDao.queryOne("SELECT id FROM reviews WHERE pedido_id = ?", pedidoId) != null) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya calificaste este pedido"));
            return;
        }
        int id = GenericDao.update(
                "INSERT INTO reviews (usuarios_id, negocio_id, pedido_id, calificacion, comentario) VALUES (?,?,?,?,?)",
                sesion.id(), pedido.get("negocios_id"), pedidoId, calificacion, comentario);
        HttpUtil.sendJson(exchange, 201, Map.of("id", id));
    }
}
