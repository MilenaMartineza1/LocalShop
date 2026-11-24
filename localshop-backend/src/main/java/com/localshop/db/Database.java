package com.localshop.db;

import java.io.IOException;
import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

public class Database {

    private static Properties config;

    private static Properties loadConfig() {
        if (config == null) {
            config = new Properties();
            try (InputStream in = Database.class.getClassLoader().getResourceAsStream("db.properties")) {
                if (in == null) {
                    throw new RuntimeException("No se encontró db.properties en resources/");
                }
                config.load(in);
                // En un servidor en la nube la configuración llega por variables de entorno.
                sobrescribir("DB_URL", "db.url");
                sobrescribir("DB_USER", "db.user");
                sobrescribir("DB_PASSWORD", "db.password");
                sobrescribir("PORT", "server.port");
                sobrescribir("WEB_DIR", "web.dir");
            } catch (IOException e) {
                throw new RuntimeException("Error leyendo db.properties: " + e.getMessage(), e);
            }
        }
        return config;
    }

    private static void sobrescribir(String variable, String clave) {
        String valor = System.getenv(variable);
        if (valor != null && !valor.isBlank()) config.setProperty(clave, valor);
    }

    public static Connection getConnection() throws SQLException {
        Properties p = loadConfig();
        return DriverManager.getConnection(
                p.getProperty("db.url"),
                p.getProperty("db.user"),
                p.getProperty("db.password")
        );
    }

    public static String getProperty(String key, String porDefecto) {
        return loadConfig().getProperty(key, porDefecto);
    }

    public static int getServerPort() {
        String port = loadConfig().getProperty("server.port", "8080");
        return Integer.parseInt(port);
    }
}
