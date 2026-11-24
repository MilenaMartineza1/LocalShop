package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * GET    /api/promociones                    promociones automáticas vigentes de todos los negocios (público)
 * GET    /api/promociones?negocio_id=        vigentes y automáticas; el dueño ve todas, con cupones y usos
 * POST   /api/promociones                    { nombre, descripcion, descuento, dias, producto_id?, codigo?, compra_minima?, usos_max? }
 * PUT    /api/promociones/{id}               { estado } o { extender: dias }
 * DELETE /api/promociones/{id}
 */
public class PromocionesHandler implements HttpHandler {
    private static final Pattern CODIGO = Pattern.compile("^[A-Z0-9]{3,20}$");

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
        Sesiones.Sesion sesion = Sesiones.validar(HttpUtil.token(exchange));

        if (qp.containsKey("negocio_id")) {
            int negocioId = Integer.parseInt(qp.get("negocio_id"));
            boolean esDueno = sesion != null && sesion.rol().equals("negocio") && sesion.id() == negocioId;
            if (esDueno) {
                HttpUtil.sendJson(exchange, 200, GenericDao.query(
                        "SELECT p.*, (CASE WHEN p.estado = 'activo' AND NOW() BETWEEN p.fecha_inicio AND p.fecha_fin " +
                                "AND (p.usos_max IS NULL OR p.usos < p.usos_max) THEN 1 ELSE 0 END) AS vigente, " +
                                "(NOW() > p.fecha_fin) AS vencida, " +
                                "pr.nombre_producto " +
                                "FROM promociones p LEFT JOIN productos pr ON p.producto_id = pr.id " +
                                "WHERE p.negocio_id = ? ORDER BY p.id DESC", negocioId));
            } else {
                HttpUtil.sendJson(exchange, 200, GenericDao.query(
                        "SELECT p.id, p.nombre, p.descripcion, p.descuento, p.producto_id, p.compra_minima, p.fecha_fin " +
                                "FROM promociones p WHERE p.negocio_id = ? AND p.codigo IS NULL AND " + PromoCalculo.vigente("p.") +
                                " ORDER BY p.descuento DESC", negocioId));
            }
            return;
        }
        HttpUtil.sendJson(exchange, 200, GenericDao.query(
                "SELECT p.id, p.nombre, p.descripcion, p.descuento, p.producto_id, p.compra_minima, p.fecha_fin, " +
                        "n.id AS negocio_id, n.nombre_negocio " +
                        "FROM promociones p JOIN negocios n ON p.negocio_id = n.id " +
                        "WHERE p.codigo IS NULL AND n.estado = 'activo' AND p.estado = 'activo' " +
                        "AND NOW() BETWEEN p.fecha_inicio AND p.fecha_fin AND (p.usos_max IS NULL OR p.usos < p.usos_max) " +
                        "ORDER BY p.descuento DESC LIMIT 12"));
    }

    private void crear(HttpExchange exchange, int negocioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nombre = body.getOrDefault("nombre", "").trim();
        String descripcion = body.getOrDefault("descripcion", "").trim();
        if (nombre.isEmpty() || nombre.length() > 80) throw new IllegalArgumentException("Escribe un título de hasta 80 caracteres");
        if (descripcion.length() > 200) descripcion = descripcion.substring(0, 200);

        double descuento = Double.parseDouble(body.getOrDefault("descuento", "0"));
        if (descuento < 1 || descuento > 90) throw new IllegalArgumentException("El descuento debe estar entre 1% y 90%");
        int dias = Integer.parseInt(body.getOrDefault("dias", "7"));
        if (dias < 1 || dias > 90) throw new IllegalArgumentException("La vigencia debe ser de 1 a 90 días");
        String minimaTxt = body.getOrDefault("compra_minima", "").trim();
        double minima = minimaTxt.isEmpty() ? 0 : Double.parseDouble(minimaTxt);
        if (minima < 0) throw new IllegalArgumentException("La compra mínima no puede ser negativa");

        Integer usosMax = null;
        String usos = body.getOrDefault("usos_max", "").trim();
        if (!usos.isEmpty()) {
            usosMax = Integer.parseInt(usos);
            if (usosMax < 1) throw new IllegalArgumentException("El límite de usos debe ser al menos 1");
        }

        Integer productoId = null;
        String prod = body.getOrDefault("producto_id", "").trim();
        if (!prod.isEmpty()) {
            productoId = Integer.parseInt(prod);
            if (GenericDao.queryOne("SELECT id FROM productos WHERE id = ? AND negocio_id = ?", productoId, negocioId) == null) {
                throw new IllegalArgumentException("Ese producto no es de tu negocio");
            }
        }

        String codigo = body.getOrDefault("codigo", "").trim().toUpperCase();
        if (!codigo.isEmpty() && !CODIGO.matcher(codigo).matches()) {
            throw new IllegalArgumentException("El cupón debe tener de 3 a 20 letras o números, sin espacios");
        }

        try {
            int id = GenericDao.update(
                    "INSERT INTO promociones (nombre, descripcion, descuento, fecha_inicio, fecha_fin, estado, negocio_id, " +
                            "codigo, producto_id, compra_minima, usos_max) " +
                            "VALUES (?,?,?,NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'activo', ?,?,?,?,?)",
                    nombre, descripcion, descuento, dias, negocioId,
                    codigo.isEmpty() ? null : codigo, productoId, minima, usosMax);
            HttpUtil.sendJson(exchange, 201, Map.of("id", id));
        } catch (java.sql.SQLException e) {
            if (HttpUtil.esDuplicado(e)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya tienes un cupón con ese código"));
                return;
            }
            throw e;
        }
    }

    private void actualizar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        if (id == null || GenericDao.queryOne("SELECT id FROM promociones WHERE id = ? AND negocio_id = ?", id, negocioId) == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Promoción no encontrada"));
            return;
        }
        if (body.containsKey("extender")) {
            int dias = Integer.parseInt(body.get("extender"));
            if (dias < 1 || dias > 90) throw new IllegalArgumentException("Puedes extender de 1 a 90 días");
            GenericDao.execute("UPDATE promociones SET fecha_fin = DATE_ADD(GREATEST(fecha_fin, NOW()), INTERVAL ? DAY) WHERE id = ?", dias, id);
        } else {
            String estado = body.getOrDefault("estado", "");
            if (!estado.equals("activo") && !estado.equals("inactivo")) throw new IllegalArgumentException("Estado no válido");
            GenericDao.execute("UPDATE promociones SET estado = ? WHERE id = ? AND negocio_id = ?", estado, id, negocioId);
        }
        HttpUtil.sendJson(exchange, 200, Map.of("id", id));
    }

    private void eliminar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        int filas = id == null ? 0 : GenericDao.execute("DELETE FROM promociones WHERE id = ? AND negocio_id = ?", id, negocioId);
        if (filas == 0) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Promoción no encontrada"));
            return;
        }
        HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
    }
}
