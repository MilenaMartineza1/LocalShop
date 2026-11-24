let ALL_NEGOCIOS_CACHE = [];
let FAVORITOS_CACHE = new Set();
let SESSION_HOME = null;

let BANNER_SLIDES = [
  { label: "Piloto Cartagena", title: "Apoya lo local", desc: "Descubre negocios cerca de ti y compra directo, sin intermediarios.", emoji: "🛍️" },
  { label: "Para negocios", title: "¿Tienes un negocio?", desc: "Regístralo gratis y empieza a vender hoy mismo en tu ciudad.", emoji: "🏪" },
  { label: "Envíos locales", title: "Rápido y cercano", desc: "Negocios de tu barrio, sin depender de grandes cadenas.", emoji: "🚴" },
];
let bannerIndex = 0;
let bannerTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  SESSION_HOME = requireSession("cliente");
  if (!SESSION_HOME) return;

  document.getElementById("greetName").textContent = `¡Hola, ${SESSION_HOME.name.split(" ")[0]}!`;
  Cart.init();
  document.getElementById("cityLabel").textContent = Store.getCity() || "Cartagena";

  document.getElementById("cityBtn").addEventListener("click", () => { window.location.href = "auth.html"; });

  setupSearch();
  setupBanner();
  document.getElementById("promoContent").addEventListener("click", () => {
    const slide = BANNER_SLIDES[bannerIndex];
    if (slide.campaniaId) irAlAnuncio(slide.campaniaId, slide.negocioId);
  });

  try {
    await loadFavoritos();
    await Promise.all([
      loadCategorias(),
      loadDestacados(),
      loadExplore(),
      loadActiveOrders(),
      loadTestimonials(),
      loadPublicidad(),
      loadOfertas(),
    ]);
    renderFavoritesSection();
  } catch (err) {
    showApiError(err);
  }
});

/* ================= Banner con flechas + puntos ================= */
function setupBanner() {
  renderBanner();
  document.getElementById("bannerPrev").addEventListener("click", () => changeBanner(-1));
  document.getElementById("bannerNext").addEventListener("click", () => changeBanner(1));
  bannerTimer = setInterval(() => changeBanner(1), 6000);
}
function changeBanner(dir) {
  bannerIndex = (bannerIndex + dir + BANNER_SLIDES.length) % BANNER_SLIDES.length;
  renderBanner();
}
function renderBanner() {
  const slide = BANNER_SLIDES[bannerIndex];
  document.getElementById("promoContent").classList.toggle("is-link", Boolean(slide.campaniaId));
  if (slide.campaniaId) registrarEventoPublicidad(slide.campaniaId, "impresion");
  document.getElementById("promoLabel").textContent = slide.label;
  document.getElementById("promoTitle").textContent = slide.title;
  document.getElementById("promoDesc").textContent = slide.desc;
  document.getElementById("promoEmoji").textContent = slide.emoji;
  const dots = document.getElementById("bannerDots");
  dots.innerHTML = BANNER_SLIDES.map((_, i) => `<span class="dot ${i === bannerIndex ? "active" : ""}" data-idx="${i}"></span>`).join("");
  dots.querySelectorAll(".dot").forEach((d) => {
    d.addEventListener("click", () => { bannerIndex = parseInt(d.dataset.idx); renderBanner(); });
  });
}

async function loadCategorias() {
  const categorias = await Api.get("/categorias");
  const grid = document.getElementById("categoriesGrid");
  grid.innerHTML = "";
  categorias.forEach((cat) => {
    const a = document.createElement("a");
    a.href = `categoria.html?cat=${cat.id}`;
    a.className = "category-btn";
    a.style.background = cat.color_tema || "#eee";
    a.innerHTML = `<span class="category-icon">${esc(cat.icono || "🏬")}</span><span class="category-name">${esc(cat.nombre)}</span>`;
    grid.appendChild(a);
  });
}

/* ================= Favoritos ================= */
async function loadFavoritos() {
  const favs = await Api.get("/favoritos");
  FAVORITOS_CACHE = new Set(favs.map((f) => f.id));
  window.FAVORITOS_FULL = favs;
}

async function toggleFavorite(negocioId, btnEl) {
  try {
    const res = await Api.post("/favoritos", { negocios_id: negocioId });
    if (res.favorited) {
      FAVORITOS_CACHE.add(negocioId);
      if (btnEl) { btnEl.classList.add("active"); btnEl.textContent = "❤️"; }
    } else {
      FAVORITOS_CACHE.delete(negocioId);
      if (btnEl) { btnEl.classList.remove("active"); btnEl.textContent = "🤍"; }
    }
    await loadFavoritos();
    renderFavoritesSection();
  } catch (err) { showApiError(err); }
}

function favButtonHtml(negocioId) {
  const isFav = FAVORITOS_CACHE.has(negocioId);
  return `<button class="fav-btn ${isFav ? "active" : ""}" data-fav-toggle="${negocioId}">${isFav ? "❤️" : "🤍"}</button>`;
}
function attachFavHandlers(container) {
  container.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.favToggle), btn);
    });
  });
}

function renderFavoritesSection() {
  const section = document.getElementById("favoritesSection");
  const row = document.getElementById("favoritesRow");
  const favs = window.FAVORITOS_FULL || [];
  if (!favs.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  row.innerHTML = "";
  favs.forEach((b) => {
    const a = document.createElement("a");
    a.href = `negocio.html?id=${b.id}`;
    a.className = "biz-scroll-card";
    a.innerHTML = `
      <div class="card-media">
        ${Img.negocio(b)}
        ${favButtonHtml(b.id)}
      </div>
      <div class="biz-scroll-body">
        <h4>${esc(b.nombre_negocio)}</h4>
        <div class="biz-pill-row"><span class="biz-pill">${esc(b.categoria_nombre || "")}</span></div>
      </div>`;
    row.appendChild(a);
  });
  attachFavHandlers(row);
}

/** "Destacados para ti": los negocios mejor calificados de toda la ciudad. */
async function loadDestacados() {
  const negocios = ALL_NEGOCIOS_CACHE.length ? ALL_NEGOCIOS_CACHE : await Api.get("/negocios");
  ALL_NEGOCIOS_CACHE = negocios;
  const top = [...negocios].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const section = document.getElementById("destacadosSection");
  const grid = document.getElementById("destacadosGrid");
  if (!top.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  grid.innerHTML = "";
  top.forEach((b) => {
    const a = document.createElement("a");
    a.href = `negocio.html?id=${b.id}`;
    a.className = "restaurant-card";
    const isNew = !b.rating || b.rating == 0;
    a.innerHTML = `
      <div class="restaurant-image card-media">
        ${Img.negocio(b)}
        ${favButtonHtml(b.id)}
      </div>
      <div class="restaurant-details">
        <h4>${esc(b.nombre_negocio)}</h4>
        <div class="restaurant-meta"><span>🏷️ ${esc(b.categoria_nombre || "")}</span></div>
        <div class="restaurant-meta">
          <span>${isNew ? "🆕 Nuevo" : `⭐ ${b.rating} (${b.review_count || 0})`}</span>
          <span>🕐 ${b.tiempo_entrega_min || 30} min</span>
        </div>
      </div>`;
    grid.appendChild(a);
  });
  attachFavHandlers(grid);
}

/** Un solo bloque "Explora tu ciudad" con pestañas de categoría. */
async function loadExplore() {
  const [categorias, negocios] = await Promise.all([Api.get("/categorias"), Api.get("/negocios")]);
  ALL_NEGOCIOS_CACHE = negocios;

  const categoriasConNegocios = categorias.filter((cat) => negocios.some((n) => n.categoria_id === cat.id));
  const tabsEl = document.getElementById("exploreTabs");
  const gridEl = document.getElementById("exploreGrid");
  const section = document.getElementById("exploreSection");

  if (!categoriasConNegocios.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";

  tabsEl.innerHTML = `<button class="explore-tab active" data-cat="todos">Todos</button>` +
    categoriasConNegocios.map((c) => `<button class="explore-tab" data-cat="${c.id}">${esc(c.icono || "")} ${esc(c.nombre)}</button>`).join("");

  function renderExploreGrid(catId) {
    const list = catId === "todos" ? negocios : negocios.filter((n) => n.categoria_id == catId);
    gridEl.innerHTML = "";
    list.forEach((b) => {
      const a = document.createElement("a");
      a.href = `negocio.html?id=${b.id}`;
      a.className = "restaurant-card";
      const isNew = !b.rating || b.rating == 0;
      a.innerHTML = `
        <div class="restaurant-image card-media">
          ${Img.negocio(b)}
          ${favButtonHtml(b.id)}
        </div>
        <div class="restaurant-details">
          <h4>${esc(b.nombre_negocio)}</h4>
          <div class="restaurant-meta"><span>🏷️ ${esc(b.categoria_nombre || "")}</span></div>
          <div class="restaurant-meta">
            <span>${isNew ? "🆕 Nuevo" : `⭐ ${b.rating}`}</span>
            <span>🕐 ${b.tiempo_entrega_min || 30} min</span>
          </div>
        </div>`;
      gridEl.appendChild(a);
    });
    attachFavHandlers(gridEl);
  }

  tabsEl.querySelectorAll(".explore-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      tabsEl.querySelectorAll(".explore-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderExploreGrid(tab.dataset.cat);
    });
  });

  renderExploreGrid("todos");
}

async function loadActiveOrders() {
  const pedidos = await Api.get("/pedidos");
  const active = pedidos.filter((p) => p.estado !== "entregado");
  const section = document.getElementById("activeOrdersSection");
  const scroll = document.getElementById("activeOrdersScroll");
  scroll.innerHTML = "";
  if (!active.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  active.forEach((o) => {
    const label = o.estado === "enviado" ? "En camino" : "Preparando";
    const div = document.createElement("div");
    div.className = "order-card";
    div.innerHTML = `
      <div class="order-header">
        ${Img.negocio({ imagen_url: o.negocio_imagen, nombre_negocio: o.nombre_negocio, categoria_nombre: o.categoria_nombre }).replace("<img ", '<img class="restaurant-avatar" ')}
        <div class="order-info">
          <h4>${esc(o.nombre_negocio)}</h4>
          <div class="order-badges"><span class="badge badge-pending">${label}</span><span class="order-time">${Store.money(o.total)}</span></div>
        </div>
      </div>
      <a class="arrow-btn" href="perfil.html" aria-label="Ver pedido">→</a>`;
    scroll.appendChild(div);
  });
}

/** Las reseñas de la sección "Esto dicen nuestros clientes" son las reales guardadas en MySQL. */
async function loadTestimonials() {
  const section = document.getElementById("testimonialsSection");
  const grid = document.getElementById("testimonialsGrid");
  let reseñas = [];
  try { reseñas = await Api.get("/reviews?recientes=3"); } catch (e) { /* sin reseñas no se muestra la sección */ }
  if (!reseñas.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  grid.innerHTML = reseñas.map((r) => `
    <div class="testimonial-card">
      <p class="testimonial-text">"${esc(r.comentario)}"</p>
      <div class="testimonial-author">
        ${avatarHtml(r.autor)}
        <div>
          <h5>${esc(r.autor)}</h5>
          <div class="testimonial-meta">${esc(r.nombre_negocio)} · ${"★".repeat(r.calificacion)}</div>
        </div>
      </div>
    </div>`).join("");
}

/* ================= Búsqueda con sugerencias ================= */
function setupSearch() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchSuggestions");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.classList.remove("open"); return; }
    const matches = ALL_NEGOCIOS_CACHE.filter((n) => n.nombre_negocio.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) {
      box.innerHTML = '<div class="search-suggestion-item" style="cursor:default;">Sin resultados</div>';
    } else {
      box.innerHTML = matches
        .map(
          (n) => `
        <a class="search-suggestion-item" href="negocio.html?id=${n.id}">
          ${Img.negocio(n, "")}
          <div><div class="s-name">${esc(n.nombre_negocio)}</div><div class="s-cat">${esc(n.categoria_nombre || "")}</div></div>
        </a>`
        )
        .join("");
    }
    box.classList.add("open");
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      window.location.href = `categoria.html?q=${encodeURIComponent(input.value.trim())}`;
    }
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !box.contains(e.target)) box.classList.remove("open");
  });
}


/* ================= Publicidad local y ofertas ================= */
const ETIQUETA_PAQUETE = { premium: "Destacado", principal: "Patrocinado", basico: "Patrocinado" };

/** Cada anuncio cuenta una impresión por sesión de navegador, para no inflar las métricas al recargar. */
function registrarEventoPublicidad(id, tipo) {
  if (tipo === "impresion") {
    try {
      const llave = `ls_imp_${id}`;
      if (sessionStorage.getItem(llave)) return;
      sessionStorage.setItem(llave, "1");
    } catch (e) { /* sin sessionStorage se cuenta igual */ }
  }
  Api.post("/publicidad/evento", { id, tipo }).catch(() => {});
}

function irAlAnuncio(campaniaId, negocioId) {
  registrarEventoPublicidad(campaniaId, "clic");
  // Pequeña espera para que el registro del clic salga antes de cambiar de página.
  setTimeout(() => { window.location.href = `negocio.html?id=${negocioId}`; }, 120);
}

async function loadPublicidad() {
  let anuncios = [];
  try { anuncios = await Api.get("/publicidad"); } catch (e) { return; }

  // Los paquetes principal y premium también aparecen como diapositiva del banner.
  const fijas = BANNER_SLIDES.filter((x) => !x.campaniaId);
  const patrocinadas = anuncios.filter((a) => a.paquete !== "basico").map((a) => ({
    label: ETIQUETA_PAQUETE[a.paquete], title: a.titulo, desc: a.mensaje, emoji: "",
    campaniaId: a.id, negocioId: a.negocio_id,
  }));
  BANNER_SLIDES = [...patrocinadas, ...fijas];
  bannerIndex = 0;
  renderBanner();

  const section = document.getElementById("sponsoredSection");
  const grid = document.getElementById("sponsoredGrid");
  if (!anuncios.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  grid.innerHTML = anuncios.map((a) => `
    <a class="restaurant-card sponsored-card" href="negocio.html?id=${a.negocio_id}" data-campania="${a.id}" data-negocio="${a.negocio_id}">
      <div class="restaurant-image card-media">
        ${Img.negocio({ imagen_url: a.imagen_url, nombre_negocio: a.nombre_negocio, categoria_nombre: a.categoria_nombre })}
        <span class="ad-tag ${a.paquete === "premium" ? "premium" : ""}">${ETIQUETA_PAQUETE[a.paquete]}</span>
      </div>
      <div class="restaurant-details">
        <h4>${esc(a.titulo)}</h4>
        <p class="ad-text">${esc(a.mensaje)}</p>
        <div class="restaurant-meta"><span>${esc(a.nombre_negocio)}</span></div>
      </div>
    </a>`).join("");
  grid.querySelectorAll("[data-campania]").forEach((card) => {
    registrarEventoPublicidad(Number(card.dataset.campania), "impresion");
    card.addEventListener("click", (e) => {
      e.preventDefault();
      irAlAnuncio(Number(card.dataset.campania), Number(card.dataset.negocio));
    });
  });
}

async function loadOfertas() {
  let promos = [];
  try { promos = await Api.get("/promociones"); } catch (e) { return; }
  const section = document.getElementById("offersSection");
  if (!promos.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  document.getElementById("offersGrid").innerHTML = promos.map((p) => `
    <a class="offer-card" href="negocio.html?id=${p.negocio_id}">
      <span class="offer-pct">${Number(p.descuento)}%</span>
      <div>
        <strong>${esc(p.nombre)}</strong>
        <p>${esc(p.nombre_negocio)}${Number(p.compra_minima) > 0 ? " - desde " + Store.money(p.compra_minima) : ""}</p>
      </div>
    </a>`).join("");
}
