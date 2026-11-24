package com.localshop.api;

import com.localshop.db.Database;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** Sirve el frontend (HTML, CSS, JS) desde la carpeta web.dir para publicar todo bajo un solo enlace. */
public class StaticHandler implements HttpHandler {

    private static final Map<String, String> TIPOS = Map.of(
            "html", "text/html; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "svg", "image/svg+xml",
            "png", "image/png",
            "jpg", "image/jpeg",
            "ico", "image/x-icon",
            "json", "application/json; charset=utf-8");

    private final Path raiz;

    public StaticHandler() {
        this.raiz = Path.of(Database.getProperty("web.dir", "web")).toAbsolutePath().normalize();
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String ruta = exchange.getRequestURI().getPath();
        if (ruta.equals("/")) ruta = "/index.html";
        Path archivo = raiz.resolve(ruta.substring(1)).normalize();

        // Evita salir de la carpeta del frontend con rutas como ../
        if (!archivo.startsWith(raiz) || !Files.isRegularFile(archivo)) {
            byte[] msg = "No encontrado".getBytes();
            exchange.sendResponseHeaders(404, msg.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(msg); }
            return;
        }
        String nombre = archivo.getFileName().toString();
        String tipo = TIPOS.getOrDefault(nombre.substring(nombre.lastIndexOf('.') + 1).toLowerCase(), "application/octet-stream");
        byte[] datos = Files.readAllBytes(archivo);
        exchange.getResponseHeaders().add("Content-Type", tipo);
        exchange.getResponseHeaders().add("Cache-Control", "no-cache");
        exchange.sendResponseHeaders(200, datos.length);
        try (OutputStream os = exchange.getResponseBody()) { os.write(datos); }
    }
}
