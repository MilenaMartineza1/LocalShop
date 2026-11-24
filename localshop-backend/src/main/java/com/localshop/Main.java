package com.localshop;

import com.localshop.api.*;
import com.localshop.db.Database;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

/**
 * Punto de entrada del backend de LocalShop.
 *
 * Para ejecutar desde IntelliJ IDEA:
 *  1. Abre esta carpeta como proyecto Maven.
 *  2. Edita src/main/resources/db.properties con tu usuario/contraseña de MySQL.
 *  3. Ejecuta SETUP_COMPLETO.sql en MySQL Workbench.
 *  4. Corre esta clase (botón ▶ sobre el método main).
 */
public class Main {

    public static void main(String[] args) throws Exception {
        int port = Database.getServerPort();
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/api/categorias", new CategoriasHandler());
        server.createContext("/api/negocios", new NegociosHandler());
        server.createContext("/api/productos", new ProductosHandler());
        server.createContext("/api/carrito", new CarritoHandler());
        server.createContext("/api/pedidos", new PedidosHandler());
        server.createContext("/api/promociones", new PromocionesHandler());
        server.createContext("/api/auth", new AuthHandler());
        server.createContext("/api/usuarios", new UsuariosHandler());
        server.createContext("/api/reviews", new ReviewsHandler());
        server.createContext("/api/configuracion", new ConfiguracionHandler());
        server.createContext("/api/favoritos", new FavoritosHandler());
        server.createContext("/api/insumos", new InsumosHandler());
        server.createContext("/api/direcciones", new DireccionesHandler());
        server.createContext("/api/publicidad", new PublicidadHandler());
        server.createContext("/", new StaticHandler());

        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println("=================================================");
        System.out.println(" LocalShop backend corriendo en http://localhost:" + port);
        System.out.println(" Sitio:  http://localhost:" + port + "/");
        System.out.println(" Prueba: http://localhost:" + port + "/api/categorias");
        System.out.println("=================================================");
    }
}
