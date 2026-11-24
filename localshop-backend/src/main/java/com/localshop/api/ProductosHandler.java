package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

public class ProductosHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            String method = exchange.getRequestMethod();
            if (method.equals("GET")) {
                listar(exchange);
                return;
            }
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
            if (sesion == null) return;
            switch (method) {
                case "POST" -> crear(exchange, sesion.id());
                case "PUT" -> actualizar(exchange, sesion.id());
                case "DELETE" -> eliminar(exchange, sesion.id());
                default -> HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void listar(HttpExchange exchange) throws Exception {
        Map<String, String> qp = HttpUtil.parseQuery(exchange);
        StringBuilder sql = new StringBuilder(
                "SELECT p.*, c.nombre AS categoria_nombre FROM productos p " +
                        "LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1");
        java.util.List<Object> params = new java.util.ArrayList<>();
        // Los productos ocultos solo los ve su propio negocio, en su panel.
        Sesiones.Sesion sesion = Sesiones.validar(HttpUtil.token(exchange));
        boolean esDueno = sesion != null && sesion.rol().equals("negocio")
                && qp.containsKey("negocio_id") && qp.get("negocio_id").equals(String.valueOf(sesion.id()));
        if (!esDueno) sql.append(" AND p.activo = 1");
        if (qp.containsKey("negocio_id")) {
            sql.append(" AND p.negocio_id = ?");
            params.add(Integer.parseInt(qp.get("negocio_id")));
        }
        if (qp.containsKey("categoria_id")) {
            sql.append(" AND p.categoria_id = ?");
            params.add(Integer.parseInt(qp.get("categoria_id")));
        }
        var rows = GenericDao.query(sql.toString(), params.toArray());
        HttpUtil.sendJson(exchange, 200, rows);
    }

    private void crear(HttpExchange exchange, int negocioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nombreNuevo = body.getOrDefault("nombre_producto", "").trim();
        if (nombreNuevo.isEmpty() || Double.parseDouble(body.getOrDefault("precio", "0")) <= 0
                || Integer.parseInt(body.getOrDefault("stock", "0")) < 0) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Revisa el nombre, un precio mayor a cero y un stock válido"));
            return;
        }
        int id = GenericDao.update(
                "INSERT INTO productos (nombre_producto, descripcion_producto, precio, categoria_id, negocio_id, imagen_url, stock) " +
                        "VALUES (?,?,?,?,?,?,?)",
                body.get("nombre_producto"),
                body.getOrDefault("descripcion_producto", ""),
                Double.parseDouble(body.getOrDefault("precio", "0")),
                body.get("categoria_id") != null ? Integer.parseInt(body.get("categoria_id")) : null,
                negocioId,
                body.getOrDefault("imagen_url", "").isBlank() ? null : body.get("imagen_url"),
                Integer.parseInt(body.getOrDefault("stock", "0"))
        );
        HttpUtil.sendJson(exchange, 201, Map.of("id", id));
    }

    private void actualizar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        if (id == null || GenericDao.queryOne("SELECT id FROM productos WHERE id = ? AND negocio_id = ?", id, negocioId) == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Producto no encontrado"));
            return;
        }
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        if (body.containsKey("activo") && !body.containsKey("nombre_producto")) {
            cambiarVisibilidad(exchange, id, negocioId, body.get("activo").equals("true") || body.get("activo").equals("1"));
            return;
        }
        String nombre = body.getOrDefault("nombre_producto", "").trim();
        double precio = Double.parseDouble(body.getOrDefault("precio", "0"));
        int stock = Integer.parseInt(body.getOrDefault("stock", "0"));
        if (nombre.isEmpty() || precio <= 0 || stock < 0) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Revisa el nombre, un precio mayor a cero y un stock válido"));
            return;
        }
        GenericDao.execute(
                "UPDATE productos SET nombre_producto = ?, descripcion_producto = ?, precio = ?, stock = ? WHERE id = ? AND negocio_id = ?",
                nombre, body.getOrDefault("descripcion_producto", "").trim(), precio, stock, id, negocioId);
        HttpUtil.sendJson(exchange, 200, Map.of("id", id));
    }

    /** PUT /api/productos/{id}/visibilidad no existe como ruta: se usa PUT con { activo } desde el panel. */
    private void cambiarVisibilidad(HttpExchange exchange, int id, int negocioId, boolean activo) throws Exception {
        GenericDao.execute("UPDATE productos SET activo = ? WHERE id = ? AND negocio_id = ?", activo ? 1 : 0, id, negocioId);
        if (!activo) {
            GenericDao.execute("DELETE FROM carrito WHERE productos_id = ? AND estado = 'pendiente'", id);
        }
        HttpUtil.sendJson(exchange, 200, Map.of("id", id, "activo", activo));
    }

    private void eliminar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        if (id == null || GenericDao.queryOne("SELECT id FROM productos WHERE id = ? AND negocio_id = ?", id, negocioId) == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Producto no encontrado"));
            return;
        }
        try {
            GenericDao.update("DELETE FROM productos WHERE id = ? AND negocio_id = ?", id, negocioId);
        } catch (java.sql.SQLException e) {
            if (HttpUtil.esDuplicado(e) || (e.getSQLState() != null && e.getSQLState().startsWith("23"))
                    || (e.getMessage() != null && e.getMessage().contains("foreign key"))) {
                // Ya tiene pedidos: se conserva para el historial y la facturación, pero deja de verse en el menú.
                GenericDao.execute("DELETE FROM carrito WHERE productos_id = ? AND estado = 'pendiente'", id);
                GenericDao.execute("UPDATE productos SET activo = 0 WHERE id = ? AND negocio_id = ?", id, negocioId);
                HttpUtil.sendJson(exchange, 200, Map.of("id", id, "oculto", true));
                return;
            }
            throw e;
        }
        HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
    }
}
