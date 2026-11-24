package com.localshop.api;

import com.localshop.dao.GenericDao;
import com.localshop.util.HttpUtil;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

public class CategoriasHandler implements HttpHandler {
    @Override
    public void handle(HttpExchange exchange) throws java.io.IOException {
        if (HttpUtil.handlePreflight(exchange)) return;
        try {
            var rows = GenericDao.query("SELECT * FROM categorias WHERE estado = 'activo' ORDER BY nombre");
            HttpUtil.sendJson(exchange, 200, rows);
        } catch (Exception e) {
            HttpUtil.fallo(exchange, e);
        }
    }
}
