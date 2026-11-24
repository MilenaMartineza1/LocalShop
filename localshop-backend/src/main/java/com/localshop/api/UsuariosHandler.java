package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.PasswordUtil;
import com.localshop.util.RateLimiter;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.sql.SQLException;
import java.util.Map;

/**
 * GET /api/usuarios/{id}            datos del cliente
 * PUT /api/usuarios/{id}            actualiza nombre, correo y teléfono
 * PUT /api/usuarios/{id}/password   { actual, nueva }
 * Solo el propio cliente puede consultar o cambiar su cuenta.
 */
public class UsuariosHandler implements HttpHandler {

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
            if (sesion == null) return;

            String path = exchange.getRequestURI().getPath();
            boolean cambioClave = path.endsWith("/password");
            String[] partes = path.split("/");
            Integer id;
            try {
                id = Integer.parseInt(partes[partes.length - (cambioClave ? 2 : 1)]);
            } catch (NumberFormatException | ArrayIndexOutOfBoundsException e) {
                id = null;
            }
            if (id == null) {
                HttpUtil.sendJson(exchange, 400, HttpUtil.error("Falta el id de usuario"));
                return;
            }
            if (id != sesion.id()) {
                HttpUtil.sendJson(exchange, 403, HttpUtil.error("No tienes permiso para esta acción."));
                return;
            }

            boolean esPut = "PUT".equalsIgnoreCase(exchange.getRequestMethod());
            if (cambioClave && esPut) {
                cambiarContrasena(exchange, id);
            } else if (esPut) {
                actualizar(exchange, id);
            } else {
                ver(exchange, id);
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void ver(HttpExchange exchange, int id) throws Exception {
        Map<String, Object> user = GenericDao.queryOne("SELECT * FROM usuarios WHERE id = ?", id);
        if (user == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Usuario no encontrado"));
            return;
        }
        user.remove("contrasena");
        HttpUtil.sendJson(exchange, 200, user);
    }

    private void actualizar(HttpExchange exchange, int id) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nombre = body.getOrDefault("nombre_completo", "").trim();
        String correo = body.getOrDefault("correo", "").trim().toLowerCase();
        if (nombre.length() < 3 || !correo.contains("@")) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Revisa el nombre y el correo"));
            return;
        }
        try {
            GenericDao.update("UPDATE usuarios SET nombre_completo = ?, correo = ?, telefono = ? WHERE id = ?",
                    nombre, correo, body.get("telefono"), id);
        } catch (SQLException e) {
            if (HttpUtil.esDuplicado(e)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya existe una cuenta con ese correo"));
                return;
            }
            throw e;
        }
        HttpUtil.sendJson(exchange, 200, Map.of("id", id, "actualizado", true));
    }

    private void cambiarContrasena(HttpExchange exchange, int id) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        Map<String, Object> user = GenericDao.queryOne("SELECT correo, contrasena FROM usuarios WHERE id = ?", id);
        if (user == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Usuario no encontrado"));
            return;
        }
        String claveRl = "cliente:" + user.get("correo");
        if (RateLimiter.LOGIN.segundosDeEspera(claveRl) > 0) {
            HttpUtil.sendJson(exchange, 429, HttpUtil.error("Demasiados intentos. Espera unos minutos."));
            return;
        }
        if (!PasswordUtil.matches(body.get("actual"), (String) user.get("contrasena"))) {
            RateLimiter.LOGIN.registrar(claveRl);
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("La contraseña actual no es correcta"));
            return;
        }
        String problema = PasswordUtil.validar(body.get("nueva"), (String) user.get("correo"));
        if (problema != null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(problema));
            return;
        }
        GenericDao.update("UPDATE usuarios SET contrasena = ? WHERE id = ?", PasswordUtil.hash(body.get("nueva")), id);
        HttpUtil.sendJson(exchange, 200, Map.of("mensaje", "Contraseña actualizada"));
    }
}
