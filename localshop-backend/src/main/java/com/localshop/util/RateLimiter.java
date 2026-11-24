package com.localshop.util;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Limita cuántas veces se puede intentar algo por clave dentro de una ventana de tiempo (en memoria). */
public final class RateLimiter {

    public static final RateLimiter LOGIN = new RateLimiter(5, 10 * 60_000L);
    public static final RateLimiter RECUPERACION = new RateLimiter(3, 15 * 60_000L);

    private final int maximo;
    private final long ventanaMs;
    private final Map<String, Deque<Long>> eventos = new ConcurrentHashMap<>();

    public RateLimiter(int maximo, long ventanaMs) {
        this.maximo = maximo;
        this.ventanaMs = ventanaMs;
    }

    /** Segundos que faltan para poder reintentar; 0 si todavía hay cupo. */
    public long segundosDeEspera(String clave) {
        Deque<Long> cola = eventos.get(clave);
        if (cola == null) return 0;
        synchronized (cola) {
            depurar(cola);
            if (cola.size() < maximo) return 0;
            long libera = cola.peekFirst() + ventanaMs;
            return Math.max(1, (libera - System.currentTimeMillis() + 999) / 1000);
        }
    }

    public void registrar(String clave) {
        Deque<Long> cola = eventos.computeIfAbsent(clave, k -> new ArrayDeque<>());
        synchronized (cola) {
            depurar(cola);
            cola.addLast(System.currentTimeMillis());
        }
    }

    public void reiniciar(String clave) {
        eventos.remove(clave);
    }

    private void depurar(Deque<Long> cola) {
        long limite = System.currentTimeMillis() - ventanaMs;
        while (!cola.isEmpty() && cola.peekFirst() < limite) cola.pollFirst();
    }
}
