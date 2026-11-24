package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;

/**
 * Publicidad local de los negocios (el pago es simulado: no hay pasarela real).
 * GET  /api/publicidad               campañas vigentes, para mostrarlas a los clientes
 * GET  /api/publicidad?mine=1        campañas del negocio con sus métricas (rol negocio)
 * POST /api/publicidad               { paquete, titulo, mensaje, dias } contrata una campaña (rol negocio)
 * PUT  /api/publicidad/{id}          { estado: activa | pausada | cancelada } (rol negocio, solo las suyas)
 * POST /api/publicidad/evento        { id, tipo: impresion | clic } (rol cliente)
 */
public class PublicidadHandler implements HttpHandler {
    private static final Map<String, Integer> PRECIO_DIA = Map.of("basico", 30000, "principal", 50000, "premium", 90000);
    private static final String VIGENTE = "c.estado = 'activa' AND NOW() BETWEEN c.fecha_inicio AND c.fecha_fin";

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            String method = exchange.getRequestMethod();
            boolean evento = exchange.getRequestURI().getPath().endsWith("/evento");
            if (method.equals("GET")) {
                if ("1".equals(HttpUtil.parseQuery(exchange).get("mine"))) propias(exchange);
                else vigentes(exchange);
            } else if (method.equals("POST") && evento) {
                registrarEvento(exchange);
            } else if (method.equals("POST")) {
                contratar(exchange);
            } else if (method.equals("PUT")) {
                cambiarEstado(exchange);
            } else {
                HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void vigentes(HttpExchange exchange) throws Exception {
        HttpUtil.sendJson(exchange, 200, GenericDao.query(
                "SELECT c.id, c.paquete, c.titulo, c.mensaje, n.id AS negocio_id, n.nombre_negocio, n.imagen_url, n.direccion, " +
                        "cat.nombre AS categoria_nombre " +
                        "FROM campanias c JOIN negocios n ON c.negocio_id = n.id " +
                        "LEFT JOIN categorias cat ON n.categoria_id = cat.id " +
                        "WHERE " + VIGENTE + " AND n.estado = 'activo' " +
                        "ORDER BY FIELD(c.paquete, 'premium', 'principal', 'basico'), c.id DESC LIMIT 12"));
    }

    private void propias(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
        if (sesion == null) return;
        HttpUtil.sendJson(exchange, 200, GenericDao.query(
                "SELECT c.*, (CASE WHEN " + VIGENTE + " THEN 1 ELSE 0 END) AS vigente, (NOW() > c.fecha_fin) AS finalizada " +
                        "FROM campanias c WHERE c.negocio_id = ? ORDER BY c.id DESC", sesion.id()));
    }

    private void contratar(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
        if (sesion == null) return;
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String paquete = body.getOrDefault("paquete", "");
        Integer precio = PRECIO_DIA.get(paquete);
        if (precio == null) throw new IllegalArgumentException("Elige un paquete válido");
        String titulo = body.getOrDefault("titulo", "").trim();
        String mensaje = body.getOrDefault("mensaje", "").trim();
        if (titulo.isEmpty() || titulo.length() > 60) throw new IllegalArgumentException("El título del anuncio es obligatorio (máximo 60 caracteres)");
        if (mensaje.isEmpty() || mensaje.length() > 140) throw new IllegalArgumentException("El mensaje del anuncio es obligatorio (máximo 140 caracteres)");
        int dias = Integer.parseInt(body.getOrDefault("dias", "0"));
        if (dias < 1 || dias > 30) throw new IllegalArgumentException("La campaña puede durar de 1 a 30 días");

        Map<String, Object> activas = GenericDao.queryOne(
                "SELECT COUNT(*) AS n FROM campanias c WHERE c.negocio_id = ? AND c.estado <> 'cancelada' AND NOW() <= c.fecha_fin", sesion.id());
        if (((Number) activas.get("n")).intValue() >= 5) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya tienes 5 campañas vigentes. Cancela o espera a que termine alguna"));
            return;
        }
        int id = GenericDao.update(
                "INSERT INTO campanias (negocio_id, paquete, titulo, mensaje, fecha_inicio, fecha_fin, estado, costo_total) " +
                        "VALUES (?,?,?,?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'activa', ?)",
                sesion.id(), paquete, titulo, mensaje, dias, (double) precio * dias);
        HttpUtil.sendJson(exchange, 201, Map.of("id", id, "costo_total", (double) precio * dias));
    }

    private void cambiarEstado(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
        if (sesion == null) return;
        Integer id = HttpUtil.pathId(exchange);
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String estado = body.getOrDefault("estado", "");
        if (!estado.equals("activa") && !estado.equals("pausada") && !estado.equals("cancelada")) {
            throw new IllegalArgumentException("Estado no válido");
        }
        Map<String, Object> c = id == null ? null : GenericDao.queryOne(
                "SELECT estado, (NOW() > fecha_fin) AS finalizada FROM campanias WHERE id = ? AND negocio_id = ?", id, sesion.id());
        if (c == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Campaña no encontrada"));
            return;
        }
        if (c.get("estado").equals("cancelada")) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Una campaña cancelada no se puede reactivar"));
            return;
        }
        if (estado.equals("activa") && ((Number) c.get("finalizada")).intValue() == 1) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Esa campaña ya terminó. Contrata una nueva"));
            return;
        }
        GenericDao.execute("UPDATE campanias SET estado = ? WHERE id = ? AND negocio_id = ?", estado, id, sesion.id());
        HttpUtil.sendJson(exchange, 200, Map.of("id", id, "estado", estado));
    }

    private void registrarEvento(HttpExchange exchange) throws Exception {
        Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "cliente");
        if (sesion == null) return;
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String tipo = body.getOrDefault("tipo", "");
        String columna = tipo.equals("impresion") ? "impresiones" : tipo.equals("clic") ? "clics" : null;
        if (columna == null) throw new IllegalArgumentException("Evento no válido");
        GenericDao.execute("UPDATE campanias c SET c." + columna + " = c." + columna + " + 1 WHERE c.id = ? AND " + VIGENTE,
                Integer.parseInt(body.getOrDefault("id", "0")));
        HttpUtil.sendJson(exchange, 200, Map.of("ok", true));
    }
}
