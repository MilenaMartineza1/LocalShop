package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

/**
 * Direcciones de entrega guardadas del cliente.
 * GET /api/direcciones   POST { etiqueta, direccion }   DELETE /api/direcciones/{id}
 */
public class DireccionesHandler implements HttpHandler {
    private static final int MAX_DIRECCIONES = 5;

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
            if (sesion == null) return;
            switch (exchange.getRequestMethod()) {
                case "GET" -> HttpUtil.sendJson(exchange, 200, GenericDao.query(
                        "SELECT id, etiqueta, direccion FROM direcciones WHERE usuarios_id = ? ORDER BY id", sesion.id()));
                case "POST" -> crear(exchange, sesion.id());
                case "DELETE" -> eliminar(exchange, sesion.id());
                default -> HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void crear(HttpExchange exchange, int usuarioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String etiqueta = body.getOrDefault("etiqueta", "").trim();
        String direccion = body.getOrDefault("direccion", "").trim();
        if (etiqueta.isEmpty() || etiqueta.length() > 40) throw new IllegalArgumentException("Ponle un nombre corto a la dirección (casa, trabajo)");
        if (direccion.length() < 5 || direccion.length() > 255) throw new IllegalArgumentException("Escribe la dirección completa");
        Map<String, Object> total = GenericDao.queryOne("SELECT COUNT(*) AS n FROM direcciones WHERE usuarios_id = ?", usuarioId);
        if (((Number) total.get("n")).intValue() >= MAX_DIRECCIONES) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Puedes guardar máximo " + MAX_DIRECCIONES + " direcciones"));
            return;
        }
        int id = GenericDao.update("INSERT INTO direcciones (usuarios_id, etiqueta, direccion) VALUES (?,?,?)", usuarioId, etiqueta, direccion);
        HttpUtil.sendJson(exchange, 201, Map.of("id", id));
    }

    private void eliminar(HttpExchange exchange, int usuarioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        int filas = id == null ? 0 : GenericDao.execute("DELETE FROM direcciones WHERE id = ? AND usuarios_id = ?", id, usuarioId);
        if (filas == 0) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Dirección no encontrada"));
            return;
        }
        HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
    }
}
