/* ============================================
   LocalShop - Cliente API
   Toda la información real viene del backend Java (MySQL).
   Si cambias el puerto en db.properties, actualízalo aquí también.
   ============================================ */

/* Para publicar con un túnel: abrir el sitio una vez con ?api=https://tu-backend.trycloudflare.com
   La dirección queda guardada en el navegador. Con ?api=reset se vuelve a localhost. */
const API_BASE = (() => {
  // Si el sitio lo sirve el propio backend (puerto 8080 o un dominio publico), la API esta en el mismo origen.
  const mismoOrigen = location.protocol.startsWith("http") &&
    (location.port === "8080" || !["localhost", "127.0.0.1"].includes(location.hostname));
  const porDefecto = mismoOrigen ? location.origin : "http://localhost:8080";
  try {
    const param = new URLSearchParams(location.search).get("api");
    if (param === "reset") localStorage.removeItem("localshop_api");
    else if (/^https?:\/\//.test(param || "")) localStorage.setItem("localshop_api", param.replace(/\/+$/, ""));
    return (mismoOrigen ? porDefecto : (localStorage.getItem("localshop_api") || porDefecto)) + "/api";
  } catch (e) {
    return porDefecto + "/api";
  }
})();

const Api = {
  get(path) {
    return Api._request("GET", path);
  },
  post(path, body) {
    return Api._request("POST", path, body || {});
  },
  put(path, body) {
    return Api._request("PUT", path, body || {});
  },
  del(path) {
    return Api._request("DELETE", path);
  },

  async _request(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = Api._token();
    if (token) headers["Authorization"] = "Bearer " + token;

    let res;
    try {
      res = await fetch(API_BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error(
        "No se pudo conectar con el backend en " + API_BASE +
        ". ¿Está corriendo Main.java en IntelliJ?"
      );
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta vacía, ok */ }

    // 401 en cualquier ruta que no sea de acceso = la sesión caducó (por ejemplo, se reinició el backend).
    if (res.status === 401 && !path.startsWith("/auth/")) {
      Store.logout();
      window.location.href = "auth.html?expired=1";
      throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
    }
    if (!res.ok) {
      throw new Error((data && data.error) || `Error del servidor (${res.status})`);
    }
    return data;
  },

  _token() {
    try {
      const sesion = window.Store ? Store.getSession() : null;
      return sesion ? sesion.token : null;
    } catch (e) {
      return null;
    }
  },
};

window.Api = Api;
