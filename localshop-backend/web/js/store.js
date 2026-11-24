/* ============================================
   LocalShop - Estado local (solo sesión y UI) y utilidades compartidas.
   Los datos del marketplace (negocios, productos, pedidos...)
   viven en MySQL y se piden a través de js/api.js.
   ============================================ */

const LS_KEYS = {
  city: "localshop_city",
};

/** El panel del negocio usa la sesión de negocio; el resto de páginas, la de cliente. */
function rolDeLaPagina() {
  return /panel\.html$/.test(location.pathname) ? "negocio" : "cliente";
}
function claveSesion(rol) {
  return "localshop_session_" + rol;
}

const Store = {
  getCity() {
    return localStorage.getItem(LS_KEYS.city);
  },
  setCity(city) {
    localStorage.setItem(LS_KEYS.city, city);
  },

  // Cada rol guarda su propia sesión, así se puede ser cliente y negocio a la vez en el mismo navegador.
  getSession(rol) {
    try {
      const raw = localStorage.getItem(claveSesion(rol || rolDeLaPagina()));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  setSession(session) {
    localStorage.setItem(claveSesion(session.role), JSON.stringify(session));
    return session;
  },
  logout(rol) {
    localStorage.removeItem(claveSesion(rol || rolDeLaPagina()));
  },
  /** Cierra la sesión también en el servidor (invalida el token) y vuelve al login. */
  async logoutAndLeave() {
    try { await Api.post("/auth/logout"); } catch (e) { /* si el backend no responde igual cerramos localmente */ }
    Store.logout();
    window.location.href = "auth.html";
  },

  money(n) {
    n = Number(n) || 0;
    return "$" + Math.round(n).toLocaleString("es-CO");
  },
};

window.Store = Store;

/** Escapa texto antes de ponerlo dentro de innerHTML (nombres, notas y reseñas los escribe cualquier usuario). */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requireSession(role) {
  const session = Store.getSession();
  if (!session || !session.token || (role && session.role !== role)) {
    Store.logout();
    window.location.href = "auth.html";
    return null;
  }
  return session;
}

function setCartBadge(count) {
  document.querySelectorAll(".cart-badge").forEach((el) => {
    el.textContent = count;
  });
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function showApiError(err) {
  console.error(err);
  toast((err && err.message) || "Ocurrió un error al conectar con el servidor", 3800);
}

/* ============================================
   Imágenes: si el negocio o el producto no tiene foto propia, se genera una
   a partir de su categoría y su nombre. Así la imagen siempre corresponde a lo que se muestra.
   ============================================ */
const Visual = (() => {
  const PALETAS = {
    restaurantes: ["#9a3412", "#fb923c"],
    supermercados: ["#166534", "#4ade80"],
    farmacia: ["#0f766e", "#5eead4"],
    mascotas: ["#92400e", "#fbbf24"],
    licores: ["#6b1d3a", "#c084fc"],
    flores: ["#9d174d", "#f9a8d4"],
    tecnologia: ["#1e3a8a", "#60a5fa"],
    moda: ["#3730a3", "#e879f9"],
    default: ["#5b21b6", "#a78bfa"],
  };

  const ICONOS = {
    restaurantes: '<path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17"/>',
    supermercados: '<path d="M3 9h18l-2 11H5L3 9zM8 9l3-5M16 9l-3-5M9 13v4M12 13v4M15 13v4"/>',
    farmacia: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
    mascotas: '<circle cx="6" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.8 1.8 5.5 1.8s5.5-.2 5.5-1.8C17.5 15 15 12 12 12z"/>',
    licores: '<path d="M8 3h8l-.8 6a3.2 3.2 0 0 1-6.4 0L8 3zM12 12.2V20M8 21h8"/>',
    flores: '<circle cx="12" cy="9" r="1.8"/><circle cx="12" cy="4.8" r="2.2"/><circle cx="16.2" cy="9" r="2.2"/><circle cx="12" cy="13.2" r="2.2"/><circle cx="7.8" cy="9" r="2.2"/><path d="M12 15.4V22M12 19c-2.4-.1-3.8-1.1-4.4-3 2.2 0 3.8.9 4.4 3z"/>',
    tecnologia: '<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
    moda: '<path d="M8 3 3 7l3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0z"/>',
    default: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 6 0 2.5 2.5 0 0 0 5 0M10 20v-5h4v5"/>',
  };

  const CLAVES = ["restaurantes", "supermercados", "farmacia", "mascotas", "licores", "flores", "tecnologia", "moda"];
  const cache = new Map();

  function claveDe(categoria) {
    const n = String(categoria || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return CLAVES.find((k) => n.startsWith(k.slice(0, 5))) || "default";
  }

  function hash(texto) {
    let h = 0;
    for (const ch of String(texto)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  /**
   * Imagen SVG (data URI) para un nombre y una categoría.
   * modo "banner": icono desplazado a la derecha, para que el nombre del negocio se lea a la izquierda.
   */
  function generar(nombre, categoria, modo) {
    const clave = claveDe(categoria);
    const llave = clave + "|" + nombre + "|" + (modo || "");
    if (cache.has(llave)) return cache.get(llave);

    const [c1, c2] = PALETAS[clave];
    const h = hash(nombre);
    const x1 = 60 + (h % 180), y1 = 40 + ((h >> 3) % 120), r1 = 90 + (h % 50);
    const x2 = 360 + ((h >> 5) % 200), y2 = 160 + ((h >> 7) % 150), r2 = 110 + ((h >> 2) % 60);
    const banner = modo === "banner";
    const W = banner ? 1200 : 600, H = banner ? 300 : 350;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
      `<circle cx="${x1}" cy="${y1}" r="${r1}" fill="#fff" fill-opacity=".10"/>` +
      `<circle cx="${x2}" cy="${y2}" r="${r2}" fill="#fff" fill-opacity=".08"/>` +
      `<g transform="translate(${banner ? 1000 : 300} ${H / 2}) scale(${banner ? 5 : 7}) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
      ICONOS[clave] + "</g></svg>";
    const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    cache.set(llave, uri);
    return uri;
  }

  function esFotoReal(url) {
    return Boolean(url) && !/picsum\.photos/.test(url);
  }

  /** item = { imagen_url, nombre, categoria } */
  function src(item, modo) {
    return esFotoReal(item.imagen_url) ? item.imagen_url : generar(item.nombre, item.categoria, modo);
  }

  function img(item, alt, extraAttrs) {
    return `<img src="${esc(src(item))}" alt="${esc(alt || item.nombre)}" data-vn="${esc(item.nombre)}" data-vc="${esc(item.categoria || "")}" ${extraAttrs || ""}>`;
  }

  // Si la URL de una foto propia falla, se cambia por la imagen generada.
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (el && el.tagName === "IMG" && el.dataset.vn !== undefined && !el.dataset.fallback) {
      el.dataset.fallback = "1";
      el.src = generar(el.dataset.vn, el.dataset.vc);
    }
  }, true);

  return { src, img, generar, clave: claveDe };
})();

/* Atajos por tipo de entidad */
const Img = {
  negocio: (n, alt) => Visual.img({ imagen_url: n.imagen_url, nombre: n.nombre_negocio, categoria: n.categoria_nombre }, alt || n.nombre_negocio),
  negocioBanner: (n) => Visual.src({ imagen_url: n.imagen_url, nombre: n.nombre_negocio, categoria: n.categoria_nombre }, "banner"),
  producto: (p, alt) => Visual.img({ imagen_url: p.imagen_url, nombre: p.nombre_producto, categoria: p.categoria_nombre }, alt || p.nombre_producto),
  productoSrc: (p) => Visual.src({ imagen_url: p.imagen_url, nombre: p.nombre_producto, categoria: p.categoria_nombre }),
};

/** Avatar con las iniciales: no depende de ninguna foto de persona. */
function avatarHtml(nombre, clase) {
  const partes = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
  const iniciales = ((partes[0] || "?")[0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
  let h = 0;
  for (const ch of String(nombre || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="avatar-initials ${clase || ""}" style="background:hsl(${h % 360} 42% 38%)" aria-hidden="true">${esc(iniciales)}</span>`;
}
