package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

public class NegociosHandler implements HttpHandler {

    private static final String SELECT_BASE =
            "SELECT n.*, c.nombre AS categoria_nombre, " +
                    "COALESCE(ROUND(AVG(r.calificacion), 1), 0) AS rating, " +
                    "COUNT(DISTINCT r.id) AS review_count " +
                    "FROM negocios n " +
                    "LEFT JOIN categorias c ON n.categoria_id = c.id " +
                    "LEFT JOIN reviews r ON r.negocio_id = n.id ";

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            String method = exchange.getRequestMethod();
            Integer id = HttpUtil.pathId(exchange);
            String path = exchange.getRequestURI().getPath();
            boolean hasId = id != null && !path.endsWith("/negocios");

            if (method.equals("PUT") && hasId) {
                Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
                if (sesion == null) return;
                if (sesion.id() != id) {
                    HttpUtil.sendJson(exchange, 403, HttpUtil.error("No tienes permiso para esta acción."));
                    return;
                }
                actualizar(exchange, id);
                return;
            }
            if (hasId) {
                detalle(exchange, id);
                return;
            }
            listar(exchange);
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void detalle(HttpExchange exchange, int id) throws Exception {
        Map<String, Object> negocio = GenericDao.queryOne(
                SELECT_BASE + "WHERE n.id = ? GROUP BY n.id", id);
        if (negocio == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Negocio no encontrado"));
            return;
        }
        negocio.remove("contrasena");
        HttpUtil.sendJson(exchange, 200, negocio);
    }

    private void listar(HttpExchange exchange) throws Exception {
        Map<String, String> qp = HttpUtil.parseQuery(exchange);
        StringBuilder sql = new StringBuilder(SELECT_BASE + "WHERE n.estado = 'activo'");
        java.util.List<Object> params = new java.util.ArrayList<>();

        if (qp.containsKey("categoria_id")) {
            sql.append(" AND n.categoria_id = ?");
            params.add(Integer.parseInt(qp.get("categoria_id")));
        }
        if (qp.containsKey("ciudad")) {
            sql.append(" AND n.ciudad = ?");
            params.add(qp.get("ciudad"));
        }
        sql.append(" GROUP BY n.id");

        var rows = GenericDao.query(sql.toString(), params.toArray());
        rows.forEach(r -> r.remove("contrasena"));
        HttpUtil.sendJson(exchange, 200, rows);
    }

    private void actualizar(HttpExchange exchange, int id) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        GenericDao.update(
                "UPDATE negocios SET direccion = ?, telefono = ?, horario = ?, descripcion = ?, " +
                        "tiempo_entrega_min = ?, costo_envio = ?, pedido_minimo = ? WHERE id = ?",
                body.get("direccion"), body.get("telefono"), body.get("horario"), body.get("descripcion"),
                body.get("tiempo_entrega_min") != null ? Integer.parseInt(body.get("tiempo_entrega_min")) : 30,
                body.get("costo_envio") != null ? Double.parseDouble(body.get("costo_envio")) : 0,
                body.get("pedido_minimo") != null ? Double.parseDouble(body.get("pedido_minimo")) : 0,
                id);
        HttpUtil.sendJson(exchange, 200, Map.of("id", id, "actualizado", true));
    }
}
