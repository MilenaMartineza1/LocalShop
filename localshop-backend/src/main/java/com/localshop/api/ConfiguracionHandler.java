package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

public class ConfiguracionHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
            if (sesion == null) return;
            if ("PUT".equalsIgnoreCase(exchange.getRequestMethod())) {
                guardar(exchange, sesion.id());
            } else {
                obtener(exchange, sesion.id());
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void obtener(HttpExchange exchange, int usuarioId) throws Exception {
        Map<String, Object> config = GenericDao.queryOne(
                "SELECT * FROM configuracion_usuario WHERE usuarios_id = ? ORDER BY id DESC LIMIT 1", usuarioId);
        HttpUtil.sendJson(exchange, 200, config == null ? Map.of() : config);
    }

    private void guardar(HttpExchange exchange, int usuarioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));

        Map<String, Object> existing = GenericDao.queryOne(
                "SELECT id FROM configuracion_usuario WHERE usuarios_id = ? ORDER BY id DESC LIMIT 1", usuarioId);

        String direccion = body.getOrDefault("direccion", "");
        String metodoPago = body.getOrDefault("metodo_pago", "efectivo");
        String preferencias = body.getOrDefault("preferencias", "{}");

        if (existing != null) {
            GenericDao.update(
                    "UPDATE configuracion_usuario SET direccion = ?, metodo_pago = ?, preferencias = ? WHERE id = ?",
                    direccion, metodoPago, preferencias, existing.get("id"));
        } else {
            GenericDao.update(
                    "INSERT INTO configuracion_usuario (usuarios_id, direccion, metodo_pago, preferencias) VALUES (?,?,?,?)",
                    usuarioId, direccion, metodoPago, preferencias);
        }
        HttpUtil.sendJson(exchange, 200, Map.of("guardado", true));
    }
}
