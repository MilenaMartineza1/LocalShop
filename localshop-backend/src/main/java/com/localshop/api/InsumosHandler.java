package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.localshop.util.JsonUtil;
import com.localshop.util.Sesiones;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Inventario de insumos de cada negocio (solo rol negocio, siempre sobre sus propios datos).
 * GET    /api/insumos                  lista
 * POST   /api/insumos                  { nombre, unidad, cantidad, minimo }
 * PUT    /api/insumos/{id}             { nombre, unidad, minimo }
 * DELETE /api/insumos/{id}
 * GET    /api/insumos/movimientos      ultimas entradas y salidas
 * POST   /api/insumos/movimientos      { insumo_id, tipo: entrada|salida, cantidad, motivo }
 */
public class InsumosHandler implements HttpHandler {
    private static final int MAX_INSUMOS = 200;

    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            Sesiones.Sesion sesion = HttpUtil.exigir(exchange, "negocio");
            if (sesion == null) return;
            boolean movimientos = exchange.getRequestURI().getPath().endsWith("/movimientos");
            switch (exchange.getRequestMethod()) {
                case "GET" -> { if (movimientos) listarMovimientos(exchange, sesion.id()); else listar(exchange, sesion.id()); }
                case "POST" -> { if (movimientos) registrarMovimiento(exchange, sesion.id()); else crear(exchange, sesion.id()); }
                case "PUT" -> actualizar(exchange, sesion.id());
                case "DELETE" -> eliminar(exchange, sesion.id());
                default -> HttpUtil.sendJson(exchange, 405, HttpUtil.error("Método no permitido"));
            }
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }

    private void listar(HttpExchange exchange, int negocioId) throws Exception {
        HttpUtil.sendJson(exchange, 200, GenericDao.query(
                "SELECT id, nombre, unidad, cantidad, minimo, fecha_actualizacion FROM insumos WHERE negocio_id = ? ORDER BY nombre",
                negocioId));
    }

    private void listarMovimientos(HttpExchange exchange, int negocioId) throws Exception {
        HttpUtil.sendJson(exchange, 200, GenericDao.query(
                "SELECT m.id, m.tipo, m.cantidad, m.motivo, m.fecha, i.nombre, i.unidad " +
                        "FROM movimientos_insumo m JOIN insumos i ON m.insumo_id = i.id " +
                        "WHERE i.negocio_id = ? ORDER BY m.fecha DESC, m.id DESC LIMIT 30", negocioId));
    }

    private static BigDecimal numero(String valor, String campo) {
        try {
            BigDecimal n = new BigDecimal(valor == null || valor.isBlank() ? "0" : valor.trim().replace(",", "."));
            if (n.signum() < 0 || n.compareTo(new BigDecimal("1000000")) > 0) throw new IllegalArgumentException(campo + " no es válido");
            return n;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(campo + " no es válido");
        }
    }

    private void crear(HttpExchange exchange, int negocioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nombre = body.getOrDefault("nombre", "").trim();
        String unidad = body.getOrDefault("unidad", "unidades").trim();
        if (nombre.isEmpty() || nombre.length() > 100) throw new IllegalArgumentException("Escribe el nombre del insumo");
        if (unidad.isEmpty() || unidad.length() > 20) throw new IllegalArgumentException("La unidad no es válida");
        BigDecimal cantidad = numero(body.get("cantidad"), "La cantidad");
        BigDecimal minimo = numero(body.get("minimo"), "El mínimo");

        Map<String, Object> total = GenericDao.queryOne("SELECT COUNT(*) AS n FROM insumos WHERE negocio_id = ?", negocioId);
        if (((Number) total.get("n")).intValue() >= MAX_INSUMOS) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("Llegaste al máximo de insumos permitidos"));
            return;
        }
        try {
            int id = GenericDao.update(
                    "INSERT INTO insumos (negocio_id, nombre, unidad, cantidad, minimo) VALUES (?,?,?,?,?)",
                    negocioId, nombre, unidad, cantidad, minimo);
            if (cantidad.signum() > 0) {
                GenericDao.update("INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, motivo) VALUES (?, 'entrada', ?, 'Existencia inicial')", id, cantidad);
            }
            HttpUtil.sendJson(exchange, 201, Map.of("id", id));
        } catch (java.sql.SQLException e) {
            if (HttpUtil.esDuplicado(e)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya tienes un insumo con ese nombre"));
                return;
            }
            throw e;
        }
    }

    private void actualizar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        String nombre = body.getOrDefault("nombre", "").trim();
        String unidad = body.getOrDefault("unidad", "unidades").trim();
        if (nombre.isEmpty() || nombre.length() > 100) throw new IllegalArgumentException("Escribe el nombre del insumo");
        if (unidad.isEmpty() || unidad.length() > 20) throw new IllegalArgumentException("La unidad no es válida");
        BigDecimal minimo = numero(body.get("minimo"), "El mínimo");
        try {
            int filas = id == null ? 0 : GenericDao.execute(
                    "UPDATE insumos SET nombre = ?, unidad = ?, minimo = ? WHERE id = ? AND negocio_id = ?",
                    nombre, unidad, minimo, id, negocioId);
            if (filas == 0) {
                HttpUtil.sendJson(exchange, 404, HttpUtil.error("Insumo no encontrado"));
                return;
            }
            HttpUtil.sendJson(exchange, 200, Map.of("id", id));
        } catch (java.sql.SQLException e) {
            if (HttpUtil.esDuplicado(e)) {
                HttpUtil.sendJson(exchange, 409, HttpUtil.error("Ya tienes un insumo con ese nombre"));
                return;
            }
            throw e;
        }
    }

    private void eliminar(HttpExchange exchange, int negocioId) throws Exception {
        Integer id = HttpUtil.pathId(exchange);
        int filas = id == null ? 0 : GenericDao.execute("DELETE FROM insumos WHERE id = ? AND negocio_id = ?", id, negocioId);
        if (filas == 0) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Insumo no encontrado"));
            return;
        }
        HttpUtil.sendJson(exchange, 200, Map.of("deleted", id));
    }

    private void registrarMovimiento(HttpExchange exchange, int negocioId) throws Exception {
        Map<String, String> body = JsonUtil.parseFlatObject(HttpUtil.readBody(exchange));
        int insumoId = Integer.parseInt(body.getOrDefault("insumo_id", "0"));
        String tipo = body.getOrDefault("tipo", "");
        String motivo = body.getOrDefault("motivo", "").trim();
        if (motivo.length() > 120) motivo = motivo.substring(0, 120);
        if (!tipo.equals("entrada") && !tipo.equals("salida")) throw new IllegalArgumentException("Tipo de movimiento no válido");
        BigDecimal cantidad = numero(body.get("cantidad"), "La cantidad");
        if (cantidad.signum() == 0) throw new IllegalArgumentException("La cantidad debe ser mayor a cero");

        Map<String, Object> insumo = GenericDao.queryOne(
                "SELECT cantidad FROM insumos WHERE id = ? AND negocio_id = ?", insumoId, negocioId);
        if (insumo == null) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("Insumo no encontrado"));
            return;
        }
        BigDecimal actual = new BigDecimal(insumo.get("cantidad").toString());
        if (tipo.equals("salida") && cantidad.compareTo(actual) > 0) {
            HttpUtil.sendJson(exchange, 409, HttpUtil.error("No puedes sacar más de lo que hay (" + actual.stripTrailingZeros().toPlainString() + ")"));
            return;
        }
        BigDecimal nueva = tipo.equals("entrada") ? actual.add(cantidad) : actual.subtract(cantidad);
        GenericDao.execute("UPDATE insumos SET cantidad = ? WHERE id = ? AND negocio_id = ?", nueva, insumoId, negocioId);
        GenericDao.update("INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, motivo) VALUES (?,?,?,?)",
                insumoId, tipo, cantidad, motivo.isEmpty() ? null : motivo);
        HttpUtil.sendJson(exchange, 200, Map.of("id", insumoId, "cantidad", nueva));
    }
}
