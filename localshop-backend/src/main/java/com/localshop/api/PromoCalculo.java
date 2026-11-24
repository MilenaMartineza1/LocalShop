package com.localshop.api;

import com.localshop.dao.GenericDao;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Cálculo único de descuentos. Lo usan la cotización del carrito y la creación del pedido,
 * así lo que el cliente ve antes de confirmar es exactamente lo que se cobra.
 *
 * Reglas: las promociones automáticas (sin código) se aplican solas; un cupón solo si el cliente
 * lo escribe. Nunca se suman: se aplica la que más descuento da.
 */
public final class PromoCalculo {
    public record Linea(int productoId, int cantidad, double precio) {}

    public record Resultado(double subtotal, double descuento, Integer promoId, String promoNombre,
                            String codigo, String codigoError, String aviso) {}

    private PromoCalculo() {}

    /** Condición SQL de "promoción vigente" para una tabla con el alias dado (por ejemplo "p."). */
    static String vigente(String a) {
        return a + "estado = 'activo' AND NOW() BETWEEN " + a + "fecha_inicio AND " + a + "fecha_fin " +
                "AND (" + a + "usos_max IS NULL OR " + a + "usos < " + a + "usos_max)";
    }

    public static Resultado calcular(int negocioId, List<Linea> lineas, String codigoIngresado) throws java.sql.SQLException {
        double subtotal = 0;
        for (Linea l : lineas) subtotal += l.precio() * l.cantidad();

        String codigo = codigoIngresado == null ? "" : codigoIngresado.trim().toUpperCase();
        List<Map<String, Object>> promos = GenericDao.query(
                "SELECT id, nombre, descuento, producto_id, compra_minima, codigo FROM promociones " +
                        "WHERE negocio_id = ? AND " + vigente(""), negocioId);

        String codigoError = null;
        boolean cuponEncontrado = false;
        List<Map<String, Object>> candidatas = new ArrayList<>();
        for (var p : promos) {
            String c = (String) p.get("codigo");
            if (c == null) {
                candidatas.add(p);
            } else if (!codigo.isEmpty() && c.equalsIgnoreCase(codigo)) {
                cuponEncontrado = true;
                candidatas.add(p);
            }
        }
        if (!codigo.isEmpty() && !cuponEncontrado) {
            codigoError = "Ese cupón no existe o ya no está vigente";
        }

        double mejor = 0;
        Map<String, Object> ganadora = null;
        for (var p : candidatas) {
            double minima = ((Number) p.get("compra_minima")).doubleValue();
            boolean esCupon = p.get("codigo") != null;
            if (subtotal < minima) {
                if (esCupon) codigoError = "Este cupón exige una compra mínima de $" + Math.round(minima);
                continue;
            }
            double base = subtotal;
            if (p.get("producto_id") != null) {
                int pid = ((Number) p.get("producto_id")).intValue();
                base = 0;
                for (Linea l : lineas) if (l.productoId() == pid) base += l.precio() * l.cantidad();
            }
            double monto = Math.round(base * ((Number) p.get("descuento")).doubleValue() / 100.0);
            if (monto > mejor) {
                mejor = monto;
                ganadora = p;
            }
        }

        String aviso = null;
        if (ganadora != null && cuponEncontrado && ganadora.get("codigo") == null) {
            aviso = "Se aplicó la promoción del negocio porque te ahorra más que el cupón";
        }
        if (ganadora == null) return new Resultado(subtotal, 0, null, null, null, codigoError, aviso);
        String usado = ganadora.get("codigo") == null ? null : (String) ganadora.get("codigo");
        return new Resultado(subtotal, mejor, ((Number) ganadora.get("id")).intValue(),
                (String) ganadora.get("nombre"), usado, usado == null ? codigoError : null, aviso);
    }
}
