let SESSION_CAT = null;
let FAVS_CAT = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  SESSION_CAT = requireSession("cliente");
  if (!SESSION_CAT) return;
  try {
    const favs = await Api.get("/favoritos");
    FAVS_CAT = new Set(favs.map((f) => f.id));
  } catch (e) { /* si falla, seguimos sin favoritos precargados */ }

  const params = new URLSearchParams(window.location.search);
  const catId = params.get("cat");
  const query = params.get("q");

  try {
    if (query) {
      const negocios = await Api.get("/negocios");
      const q = query.toLowerCase();
      const filtered = negocios.filter(
        (n) => n.nombre_negocio.toLowerCase().includes(q) || (n.categoria_nombre || "").toLowerCase().includes(q)
      );
      document.getElementById("headerTitle").textContent = `Resultados: "${query}"`;
      document.getElementById("catTitle").textContent = `Resultados para "${query}"`;
      document.getElementById("catSubtitle").textContent = `${filtered.length} negocios encontrados`;
      document.getElementById("catIcon").textContent = "🔎";
      renderStores(filtered);
    } else {
      const categorias = await Api.get("/categorias");
      const cat = categorias.find((c) => String(c.id) === String(catId)) || categorias[0];
      document.getElementById("headerTitle").textContent = `Categoría: ${cat.nombre}`;
      document.getElementById("catTitle").textContent = cat.nombre;
      document.getElementById("catSubtitle").textContent = cat.descripcion_local || `Encuentra los mejores negocios de ${cat.nombre.toLowerCase()}`;
      document.getElementById("catIcon").textContent = cat.icono || "🏬";

      const negocios = await Api.get(`/negocios?categoria_id=${cat.id}`);
      renderStores(negocios);

      document.querySelectorAll(".filter-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          let sorted = [...negocios];
          if (tab.dataset.filter === "valorado") sorted.sort((a, b) => b.rating - a.rating);
          if (tab.dataset.filter === "rapida") sorted.sort((a, b) => a.tiempo_entrega_min - b.tiempo_entrega_min);
          renderStores(sorted);
        });
      });
      document.getElementById("sortBtn").addEventListener("click", () => {
        renderStores([...negocios].sort((a, b) => b.rating - a.rating));
      });
    }
  } catch (err) {
    document.getElementById("storesGrid").innerHTML = `<p style="padding:40px;color:#c00;">${esc(err.message)}</p>`;
  }
});

function renderStores(stores) {
  const grid = document.getElementById("storesGrid");
  grid.innerHTML = "";
  if (!stores.length) {
    grid.innerHTML = '<p style="padding:40px;color:#999;">No hay negocios disponibles.</p>';
    return;
  }
  stores.forEach((store) => {
    const a = document.createElement("a");
    a.href = `negocio.html?id=${store.id}`;
    a.className = "restaurant-list-card";
    const isFav = FAVS_CAT.has(store.id);
    a.innerHTML = `
      <div class="restaurant-list-image card-media">
        ${Img.negocio(store)}
        <button class="fav-btn ${isFav ? "active" : ""}" data-fav-toggle="${store.id}">${isFav ? "❤️" : "🤍"}</button>
      </div>
      <div class="restaurant-list-details">
        <div class="restaurant-list-header">
          <h3>${esc(store.nombre_negocio)}</h3>
          <div><span class="rating-value">⭐ ${store.rating > 0 ? store.rating : "Nuevo"}</span> ${store.review_count > 0 ? `<span class="rating-count">(${store.review_count})</span>` : ""}</div>
        </div>
        <div class="restaurant-list-meta">
          <span class="meta-item">🕐 ${store.tiempo_entrega_min || 30} min</span>
          <span class="meta-item">🚚 ${store.costo_envio > 0 ? Store.money(store.costo_envio) : "Envío gratis"}</span>
        </div>
        <span class="order-now-link">Ver negocio →</span>
      </div>`;
    grid.appendChild(a);
  });

  grid.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const negocioId = parseInt(btn.dataset.favToggle);
        const res = await Api.post("/favoritos", { negocios_id: negocioId });
        btn.textContent = res.favorited ? "❤️" : "🤍";
        btn.classList.toggle("active", res.favorited);
        if (res.favorited) FAVS_CAT.add(negocioId); else FAVS_CAT.delete(negocioId);
      } catch (err) { console.error(err); }
    });
  });
}
