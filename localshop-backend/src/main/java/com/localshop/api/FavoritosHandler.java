package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

public class FavoritosHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
            if (sesion == null) return;
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                alternar(exchange, sesion.id());
            } else {
                listar(exchange, sesion.id());
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void listar(HttpExchange exchange, int usuarioId) throws Exception {
        var rows = GenericDao.query(
                "SELECT f.id AS favorito_id, n.*, c.nombre AS categoria_nombre FROM favoritos f " +
                        "JOIN negocios n ON f.negocios_id = n.id " +
                        "LEFT JOIN categorias c ON n.categoria_id = c.id " +
                        "WHERE f.usuarios_id = ?", usuarioId);
        rows.forEach(r -> r.remove("contrasena"));
        HttpUtil.sendJson(exchange, 200, rows);
    }

    private void alternar(HttpExchange exchange, int usuarioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int negocioId = Integer.parseInt(body.get("negocios_id"));

        Map<String, Object> existing = GenericDao.queryOne(
                "SELECT id FROM favoritos WHERE usuarios_id = ? AND negocios_id = ?", usuarioId, negocioId);

        if (existing != null) {
            GenericDao.update("DELETE FROM favoritos WHERE id = ?", existing.get("id"));
            HttpUtil.sendJson(exchange, 200, Map.of("favorited", false));
        } else {
            int id = GenericDao.update(
                    "INSERT INTO favoritos (usuarios_id, negocios_id) VALUES (?,?)", usuarioId, negocioId);
            HttpUtil.sendJson(exchange, 201, Map.of("favorited", true, "id", id));
        }
    }
}
