package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

/**
 * Carrito del cliente autenticado. Cada línea puede llevar una nota ("sin cebolla", "con adición de queso").
 *
 * GET    /api/carrito                    líneas pendientes con datos del producto y del negocio
 * POST   /api/carrito                    { productos_id, cantidad, nota }
 * PUT    /api/carrito/{id}               { cantidad } y/o { nota }
 * DELETE /api/carrito/{id}
 */
public class CarritoHandler implements HttpHandler {

    private static final int MAX_CANTIDAD = 50;
    private static final int MAX_NOTA = 200;

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
            if (sesion == null) return;

            switch (exchange.getRequestMethod()) {
                case "GET" -> ver(exchange, sesion.id());
                case "POST" -> agregar(exchange, sesion.id());
                case "PUT" -> actualizar(exchange, sesion.id());
                case "DELETE" -> quitar(exchange, sesion.id());
                default -> HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private static String limpiarNota(String nota) {
        if (nota == null) return "";
        String n = nota.trim();
        return n.length() > MAX_NOTA ? n.substring(0, MAX_NOTA) : n;
    }

    private void ver(HttpExchange exchange, int usuarioId) throws Exception {
        var rows = GenericDao.query(
                "SELECT c.id, c.cantidad, c.nota, p.id AS producto_id, p.nombre_producto, p.descripcion_producto, p.precio, " +
                        "p.imagen_url, cat.nombre AS categoria_nombre, p.negocio_id, n.nombre_negocio, " +
                        "n.costo_envio, n.pedido_minimo, n.tiempo_entrega_min " +
                        "FROM carrito c " +
                        "JOIN productos p ON c.productos_id = p.id " +
                        "JOIN negocios n ON p.negocio_id = n.id " +
                        "LEFT JOIN categorias cat ON p.categoria_id = cat.id " +
                        "WHERE c.usuarios_id = ? AND c.estado = 'pendiente' " +
                        "ORDER BY p.negocio_id, c.id", usuarioId);
        HttpUtil.sendJson(exchange, 200, rows);
    }

    private void agregar(HttpExchange exchange, int usuarioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int productoId = Integer.parseInt(body.get("productos_id"));
        int cantidad = Math.min(MAX_CANTIDAD, Math.max(1, Integer.parseInt(body.getOrDefault("cantidad", "1"))));
        String nota = limpiarNota(body.get("nota"));

        Map<String, Object> producto = GenericDao.queryOne("SELECT id, stock FROM productos WHERE id = ? AND activo = 1", productoId);
        if (producto == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Ese producto ya no está disponible"));
            return;
        }
        if (producto.get("stock") == null || ((Number) producto.get("stock")).intValue() <= 0) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Este producto está agotado"));
            return;
        }

        // Mismo producto con la misma nota suma cantidad; con otra nota queda como línea aparte.
        Map<String, Object> existente = GenericDao.queryOne(
                "SELECT id, cantidad FROM carrito WHERE usuarios_id = ? AND productos_id = ? AND estado = 'pendiente' AND nota = ?",
                usuarioId, productoId, nota);

        if (existente != null) {
            int nueva = Math.min(MAX_CANTIDAD, ((Number) existente.get("cantidad")).intValue() + cantidad);
            GenericDao.update("UPDATE carrito SET cantidad = ? WHERE id = ?", nueva, existente.get("id"));
            HttpUtil.sendJson(exchange, 200, Map.of("id", existente.get("id"), "cantidad", nueva));
        } else {
            int id = GenericDao.update(
                    "INSERT INTO carrito (usuarios_id, productos_id, cantidad, nota) VALUES (?,?,?,?)",
                    usuarioId, productoId, cantidad, nota);
            HttpUtil.sendJson(exchange, 201, Map.of("id", id, "cantidad", cantidad));
        }
    }

    private void actualizar(HttpExchange exchange, int usuarioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        if (id == null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Falta el id de la línea del carrito"));
            return;
        }
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));

        if (body.containsKey("cantidad")) {
            int cantidad = Integer.parseInt(body.get("cantidad"));
            if (cantidad <= 0) {
                GenericDao.update("DELETE FROM carrito WHERE id = ? AND usuarios_id = ?", id, usuarioId);
                HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
                return;
            }
            GenericDao.update("UPDATE carrito SET cantidad = ? WHERE id = ? AND usuarios_id = ? AND estado = 'pendiente'",
                    Math.min(cantidad, MAX_CANTIDAD), id, usuarioId);
        }
        if (body.containsKey("nota")) {
            GenericDao.update("UPDATE carrito SET nota = ? WHERE id = ? AND usuarios_id = ? AND estado = 'pendiente'",
                    limpiarNota(body.get("nota")), id, usuarioId);
        }
        HttpUtil.sendJson(exchange, 200, Map.of("id", id));
    }

    private void quitar(HttpExchange exchange, int usuarioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        GenericDao.update("DELETE FROM carrito WHERE id = ? AND usuarios_id = ?", id, usuarioId);
        HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
    }
}
