package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.db.Database;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.MailService;
import com.localshop.util.PasswordUtil;
import com.localshop.util.RateLimiter;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.sql.SQLException;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * POST /api/auth/login     { correo, contrasena, rol }
 * POST /api/auth/register  { rol, correo, contrasena, ... }
 * POST /api/auth/forgot    { correo, rol }          -> genera un enlace de recuperación
 * POST /api/auth/reset     { token, contrasena }    -> cambia la contraseña con ese enlace
 * POST /api/auth/logout    (cabecera Authorization)
 */
public class AuthHandler implements HttpHandler {

    private static final Pattern CORREO = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final int MINUTOS_VIGENCIA_ENLACE = 30;
    /** Hash de una clave cualquiera: se usa para que login tarde igual exista o no el correo. */
    private static final String HASH_FALSO = PasswordUtil.hash("clave-de-relleno-1");

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            return;
        }
        String path = exchange.getRequestURI().getPath();
        try {
            if (path.endsWith("/login")) login(exchange);
            else if (path.endsWith("/register")) register(exchange);
            else if (path.endsWith("/forgot")) olvideContrasena(exchange);
            else if (path.endsWith("/reset")) restablecer(exchange);
            else if (path.endsWith("/logout")) logout(exchange);
            else HttpUtil.sendJson(exchange, 404, HttpUtil.error("Ruta no encontrada"));
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private static String tabla(String rol) {
        return "negocio".equals(rol) ? "negocios" : "usuarios";
    }

    private static String rolDe(Map<String, String> body) {
        return "negocio".equals(body.get("rol")) ? "negocio" : "cliente";
    }

    private static String normalizar(String correo) {
        return correo == null ? "" : correo.trim().toLowerCase();
    }

    /* ---------------- Login ---------------- */

    private void login(HttpExchange exchange) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String rol = rolDe(body);
        String correo = normalizar(body.get("correo"));
        String contrasena = body.getOrDefault("contrasena", "");
        String clave = rol + ":" + correo;

        long espera = RateLimiter.LOGIN.segundosDeEspera(clave);
        if (espera > 0) {
            long minutos = (espera + 59) / 60;
            HttpUtil.sendJson(exchange, 429, HttpUtil.error(
                    "Demasiados intentos fallidos. Espera " + minutos + " minuto(s) o usa \"¿Olvidaste tu contraseña?\"."));
            return;
        }

        String tabla = tabla(rol);
        Map<String, Object> user = GenericDao.queryOne("SELECT * FROM " + tabla + " WHERE correo = ?", correo);
        String guardado = user != null ? (String) user.get("contrasena") : HASH_FALSO;
        boolean valida = PasswordUtil.matches(contrasena, guardado) && user != null;

        if (!valida) {
            RateLimiter.LOGIN.registrar(clave);
            HttpUtil.sendJson(exchange, 401, HttpUtil.error("Correo o contraseña incorrectos"));
            return;
        }
        if ("inactivo".equals(user.get("estado"))) {
            HttpUtil.sendJson(exchange, 403, HttpUtil.error("Esta cuenta está desactivada"));
            return;
        }

        RateLimiter.LOGIN.reiniciar(clave);
        if (PasswordUtil.necesitaActualizar(guardado)) {
            GenericDao.update("UPDATE " + tabla + " SET contrasena = ? WHERE id = ?",
                    PasswordUtil.hash(contrasena), user.get("id"));
        }
        GenericDao.update("UPDATE " + tabla + " SET ultima_sesion = NOW() WHERE id = ?", user.get("id"));

        user.remove("contrasena");
        user.put("token", Sesiones.crear(rol, ((Number) user.get("id")).intValue()));
        HttpUtil.sendJson(exchange, 200, user);
    }

    private void logout(HttpExchange exchange) throws Exception {
        Sesiones.cerrar(HttpUtil.token(exchange));
        HttpUtil.sendJson(exchange, 200, Map.of("ok", true));
    }

    /* ---------------- Registro ---------------- */

    private void register(HttpExchange exchange) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String rol = rolDe(body);
        String correo = normalizar(body.get("correo"));
        String contrasena = body.get("contrasena");

        if (!CORREO.matcher(correo).matches()) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("Escribe un correo válido"));
            return;
        }
        String problema = PasswordUtil.validar(contrasena, correo);
        if (problema != null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(problema));
            return;
        }
        String hash = PasswordUtil.hash(contrasena);

        int nuevoId;
        try {
            if (rol.equals("negocio")) {
                String nombre = body.getOrDefault("nombre_negocio", "").trim();
                if (nombre.isEmpty()) {
                    HttpUtil.sendJson(exchange, 400, HttpUtil.error("El nombre del negocio es obligatorio"));
                    return;
                }
                nuevoId = GenericDao.update(
                        "INSERT INTO negocios (nombre_negocio, propietario, correo, telefono, direccion, contrasena, ciudad, categoria_id, estado, acepta_terminos, descripcion, horario, tiempo_entrega_min, costo_envio, pedido_minimo) " +
                                "VALUES (?,?,?,?,?,?,?,?, 'activo', 1, ?, ?, ?, ?, ?)",
                        nombre, body.get("propietario"), correo,
                        body.get("telefono"), body.get("direccion"), hash,
                        body.getOrDefault("ciudad", "Cartagena"),
                        body.get("categoria_id") != null ? Integer.parseInt(body.get("categoria_id")) : null,
                        body.getOrDefault("descripcion", nombre + " es un nuevo negocio local registrado en LocalShop."),
                        body.getOrDefault("horario", "Lun - Dom 9:00 AM - 8:00 PM"),
                        30, 3000, 10000);
            } else {
                String nombre = body.getOrDefault("nombre_completo", "").trim();
                if (nombre.length() < 3) {
                    HttpUtil.sendJson(exchange, 400, HttpUtil.error("Escribe tu nombre completo (mínimo 3 caracteres)"));
                    return;
                }
                nuevoId = GenericDao.update(
                        "INSERT INTO usuarios (nombre_completo, correo, telefono, contrasena, ciudad_actual, estado, rol, acepta_terminos) " +
                                "VALUES (?,?,?,?,?, 'activo', 'cliente', 1)",
                        nombre, correo, body.get("telefono"), hash,
                        body.getOrDefault("ciudad_actual", "Cartagena"));
            }
        } catch (SQLException e) {
            if (HttpUtil.esDuplicado(e)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya existe una cuenta con ese correo"));
                return;
            }
            throw e;
        }

        HttpUtil.sendJson(exchange, 201, Map.of("id", nuevoId, "rol", rol, "token", Sesiones.crear(rol, nuevoId)));
    }

    /* ---------------- Recuperar contraseña ---------------- */

    private void olvideContrasena(HttpExchange exchange) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String rol = rolDe(body);
        String correo = normalizar(body.get("correo"));
        // La respuesta es siempre la misma: así nadie puede averiguar qué correos están registrados.
        Map<String, Object> respuesta = Map.of("mensaje",
                "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Vence en "
                        + MINUTOS_VIGENCIA_ENLACE + " minutos.");

        String clave = rol + ":" + correo;
        if (!CORREO.matcher(correo).matches() || RateLimiter.RECUPERACION.segundosDeEspera(clave) > 0) {
            HttpUtil.sendJson(exchange, 200, respuesta);
            return;
        }
        RateLimiter.RECUPERACION.registrar(clave);

        Map<String, Object> user = GenericDao.queryOne("SELECT id FROM " + tabla(rol) + " WHERE correo = ?", correo);
        if (user != null) {
            String token = PasswordUtil.tokenAleatorio(32);
            GenericDao.update("DELETE FROM password_resets WHERE tipo = ? AND usuario_id = ?", rol, user.get("id"));
            GenericDao.update(
                    "INSERT INTO password_resets (tipo, usuario_id, token_hash, expira) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL " + MINUTOS_VIGENCIA_ENLACE + " MINUTE))",
                    rol, user.get("id"), PasswordUtil.sha256Hex(token));

            String base = Database.getProperty("app.front_url", "http://localhost:5500");
            MailService.enviar(correo, "Restablece tu contraseña de LocalShop",
                    "Recibimos una solicitud para cambiar tu contraseña.\n" +
                            "Abre este enlace (vence en " + MINUTOS_VIGENCIA_ENLACE + " minutos):\n" +
                            base + "/reset.html?token=" + token + "\n\n" +
                            "Si no fuiste tú, ignora este mensaje: tu contraseña no cambia.");
        }
        HttpUtil.sendJson(exchange, 200, respuesta);
    }

    private void restablecer(HttpExchange exchange) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String token = body.getOrDefault("token", "");
        String nueva = body.get("contrasena");

        Map<String, Object> fila = GenericDao.queryOne(
                "SELECT tipo, usuario_id FROM password_resets WHERE token_hash = ? AND expira > NOW()",
                PasswordUtil.sha256Hex(token));
        if (fila == null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error("El enlace no es válido o ya venció. Solicita uno nuevo."));
            return;
        }
        String rol = (String) fila.get("tipo");
        int id = ((Number) fila.get("usuario_id")).intValue();

        Map<String, Object> cuenta = GenericDao.queryOne("SELECT correo FROM " + tabla(rol) + " WHERE id = ?", id);
        String correo = cuenta != null ? (String) cuenta.get("correo") : null;
        String problema = PasswordUtil.validar(nueva, correo);
        if (problema != null) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(problema));
            return;
        }

        GenericDao.update("UPDATE " + tabla(rol) + " SET contrasena = ? WHERE id = ?", PasswordUtil.hash(nueva), id);
        GenericDao.update("DELETE FROM password_resets WHERE tipo = ? AND usuario_id = ?", rol, id);
        Sesiones.cerrarTodas(rol, id);
        if (correo != null) RateLimiter.LOGIN.reiniciar(rol + ":" + normalizar(correo));
        HttpUtil.sendJson(exchange, 200, Map.of("mensaje", "Contraseña actualizada. Ya puedes iniciar sesión."));
    }
}
