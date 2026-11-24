package com.localshop.util;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sesiones en memoria. Al iniciar sesión el backend entrega un token aleatorio; el frontend lo envía
 * en la cabecera Authorization y así el servidor sabe quién es el usuario sin confiar en un id enviado por el cliente.
 * Si se reinicia el backend las sesiones se pierden y el usuario vuelve a iniciar sesión.
 */
public final class Sesiones {

    public record Sesion(String rol, int id, long expira) {}

    private static final long DURACION_MS = 8 * 60 * 60_000L;
    private static final Map<String, Sesion> ACTIVAS = new ConcurrentHashMap<>();

    private Sesiones() {}

    public static String crear(String rol, int id) {
        String token = PasswordUtil.tokenAleatorio(32);
        ACTIVAS.put(token, new Sesion(rol, id, System.currentTimeMillis() + DURACION_MS));
        return token;
    }

    public static Sesion validar(String token) {
        if (token == null) return null;
        Sesion s = ACTIVAS.get(token);
        if (s == null) return null;
        if (s.expira() < System.currentTimeMillis()) {
            ACTIVAS.remove(token);
            return null;
        }
        return s;
    }

    public static void cerrar(String token) {
        if (token != null) ACTIVAS.remove(token);
    }

    public static void cerrarTodas(String rol, int id) {
        ACTIVAS.values().removeIf(s -> s.rol().equals(rol) && s.id() == id);
    }
}
