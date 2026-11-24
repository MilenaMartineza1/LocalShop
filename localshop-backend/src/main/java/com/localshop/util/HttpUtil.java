package com.localshop.util;

import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

public class HttpUtil {

    private static final int MAX_BODY_BYTES = 64 * 1024;

    public static void sendJson(HttpExchange exchange, int statusCode, Object body) throws IOException {
        String json = JsonUtil.toJson(body);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().add("X-Content-Type-Options", "nosniff");
        exchange.getResponseHeaders().add("Cache-Control", "no-store");
        addCors(exchange);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    public static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().add("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
        exchange.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    public static boolean handlePreflight(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            addCors(exchange);
            exchange.sendResponseHeaders(204, -1);
            return true;
        }
        return false;
    }

    public static String readBody(HttpExchange exchange) throws IOException {
        byte[] data = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (data.length > MAX_BODY_BYTES) throw new IllegalArgumentException("La solicitud es demasiado grande");
        return new String(data, StandardCharsets.UTF_8);
    }

    public static Map<String, String> parseQuery(HttpExchange exchange) {
        Map<String, String> result = new HashMap<>();
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null) return result;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            String key = URLDecoder.decode(kv[0], StandardCharsets.UTF_8);
            String value = kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "";
            result.put(key, value);
        }
        return result;
    }

    public static Integer pathId(HttpExchange exchange) {
        String path = exchange.getRequestURI().getPath();
        String[] parts = path.split("/");
        String last = parts[parts.length - 1];
        try {
            return Integer.parseInt(last);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static Map<String, Object> error(String message) {
        Map<String, Object> m = new HashMap<>();
        m.put("error", message);
        return m;
    }

    /* ---------------- Autenticación ---------------- */

    public static String token(HttpExchange exchange) {
        String h = exchange.getRequestHeaders().getFirst("Authorization");
        return (h != null && h.startsWith("Bearer ")) ? h.substring(7).trim() : null;
    }

    /**
     * Exige una sesión válida con el rol indicado ("cliente" o "negocio").
     * Si no la hay responde 401/403 y devuelve null: el handler solo debe hacer return.
     */
    public static Sesiones.Sesion exigir(HttpExchange exchange, String rol) throws IOException {
        Sesiones.Sesion s = Sesiones.validar(token(exchange));
        if (s == null) {
            sendJson(exchange, 401, error("Tu sesión expiró. Inicia sesión de nuevo."));
            return null;
        }
        if (!s.rol().equals(rol)) {
            sendJson(exchange, 403, error("No tienes permiso para esta acción."));
            return null;
        }
        return s;
    }

    /* ---------------- Errores ---------------- */

    /** Registra el error completo en la consola del backend y responde sin exponer detalles internos. */
    public static void fallo(HttpExchange exchange, Exception e) throws IOException {
        if (e instanceof IllegalArgumentException) {
            sendJson(exchange, 400, error(e instanceof NumberFormatException ? "Datos inválidos en la solicitud" : e.getMessage()));
            return;
        }
        e.printStackTrace();
        if (e instanceof SQLException) {
            sendJson(exchange, 500, error("No se pudo completar la operación en la base de datos"));
        } else {
            sendJson(exchange, 500, error("Error interno del servidor"));
        }
    }

    public static boolean esDuplicado(SQLException e) {
        String estado = e.getSQLState();
        return (estado != null && estado.startsWith("23")) || (e.getMessage() != null && e.getMessage().contains("Duplicate"));
    }
}
