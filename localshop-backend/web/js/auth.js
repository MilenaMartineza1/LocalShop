document.addEventListener("DOMContentLoaded", async () => {
  const screens = {
    city: document.getElementById("screenCity"),
    login: document.getElementById("screenLogin"),
    forgot: document.getElementById("screenForgot"),
    register: document.getElementById("screenRegister"),
  };

  function showScreen(id) {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
  }

  function setMessage(el, text) {
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
  }

  // Se decide la pantalla antes de pedir datos al backend, para que no parpadee la de ciudad.
  if (Store.getCity()) showScreen("screenLogin");

  /* ---------- Categorías para el registro de negocios ---------- */
  const catSelect = document.getElementById("regCategoria");
  try {
    const categorias = await Api.get("/categorias");
    categorias.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = `${cat.icono || ""} ${cat.nombre}`.trim();
      catSelect.appendChild(opt);
    });
  } catch (e) {
    setMessage(document.getElementById("loginNotice"), "No se pudo conectar con el backend. Verifica que Main.java esté corriendo (puerto 8080) y que MySQL esté activo.");
    document.getElementById("loginNotice").classList.add("warn");
  }

  if (new URLSearchParams(location.search).get("expired") === "1") {
    setMessage(document.getElementById("loginNotice"), "Tu sesión expiró. Inicia sesión de nuevo.");
    document.getElementById("loginNotice").classList.add("warn");
    showScreen("screenLogin");
  }

  document.getElementById("btnContinueCity").addEventListener("click", () => {
    const city = document.getElementById("citySelect").value;
    if (!city) { document.getElementById("citySelect").focus(); return; }
    Store.setCity(city);
    showScreen("screenLogin");
  });

  document.getElementById("btnGoLogin").addEventListener("click", () => showScreen("screenLogin"));
  document.getElementById("btnGoRegister").addEventListener("click", () => showScreen("screenRegister"));

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.back));
  });
  document.querySelectorAll("[data-goto]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (link.dataset.goto === "screenForgot") {
        // Hereda el rol y el correo que ya escribió la persona en el login
        const rol = activeRole(document.getElementById("loginForm"));
        document.querySelectorAll('[data-scope="forgot"] .role-btn').forEach((b) => b.classList.toggle("active", b.dataset.role === rol));
        document.getElementById("forgotEmail").value = document.getElementById("loginEmail").value;
        setMessage(document.getElementById("forgotMsg"), "");
        setMessage(document.getElementById("forgotError"), "");
      }
      showScreen(link.dataset.goto);
    });
  });

  /* ---------- Selector de rol ---------- */
  document.querySelectorAll(".role-toggle").forEach((toggle) => {
    const buttons = toggle.querySelectorAll(".role-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (toggle.dataset.scope === "forgot") return;
        const role = btn.dataset.role;

        const loginSubmit = document.getElementById("loginSubmit");
        if (loginSubmit && toggle.closest("#screenLogin")) {
          loginSubmit.textContent = role === "cliente" ? "Iniciar sesión como cliente" : "Iniciar sesión como negocio";
        }
        const fieldsCliente = document.getElementById("fieldsCliente");
        const fieldsNegocio = document.getElementById("fieldsNegocio");
        if (fieldsCliente && fieldsNegocio && toggle.closest("#screenRegister")) {
          fieldsCliente.classList.toggle("hidden", role === "negocio");
          fieldsNegocio.classList.toggle("hidden", role === "cliente");
        }
      });
    });
  });

  function activeRole(form) {
    const active = form.closest(".auth-card").querySelector(".role-btn.active");
    return active ? active.dataset.role : "cliente";
  }

  /* ---------- Mostrar / ocultar contraseña ---------- */
  document.querySelectorAll("[data-toggle-pass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePass);
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      btn.textContent = mostrar ? "Ocultar" : "Mostrar";
      btn.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
    });
  });

  /* ---------- Reglas de contraseña en vivo (el servidor las vuelve a validar) ---------- */
  const regPassword = document.getElementById("regPassword");
  regPassword.addEventListener("input", () => {
    const v = regPassword.value;
    const checks = { len: v.length >= 8, letter: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(v), digit: /\d/.test(v) };
    document.querySelectorAll("#passRules li").forEach((li) => li.classList.toggle("ok", checks[li.dataset.rule]));
  });

  function startSession(data, role, name, correo, destino) {
    Store.setSession({
      id: data.id,
      role,
      name,
      email: correo,
      token: data.token,
      businessId: role === "negocio" ? data.id : null,
      city: Store.getCity(),
    });
    window.location.href = destino || (role === "cliente" ? "index.html" : "panel.html");
  }

  /* ---------- Login ---------- */
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = activeRole(e.target);
    const correo = document.getElementById("loginEmail").value.trim();
    const contrasena = document.getElementById("loginPassword").value;
    const errorEl = document.getElementById("loginError");
    const submitBtn = document.getElementById("loginSubmit");
    const label = role === "cliente" ? "Iniciar sesión como cliente" : "Iniciar sesión como negocio";
    setMessage(errorEl, "");

    if (!correo || !contrasena) {
      setMessage(errorEl, "Escribe tu correo y tu contraseña.");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Conectando...";

    try {
      const user = await Api.post("/auth/login", { correo, contrasena, rol: role });
      startSession(user, role, role === "cliente" ? user.nombre_completo : user.nombre_negocio, user.correo);
    } catch (err) {
      setMessage(errorEl, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = label;
    }
  });

  /* ---------- Recuperar contraseña ---------- */
  document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = document.getElementById("forgotEmail").value.trim();
    const msg = document.getElementById("forgotMsg");
    const errorEl = document.getElementById("forgotError");
    const btn = document.getElementById("forgotSubmit");
    setMessage(msg, "");
    setMessage(errorEl, "");
    if (!correo.includes("@")) {
      setMessage(errorEl, "Escribe el correo de tu cuenta.");
      return;
    }
    btn.disabled = true;
    try {
      const res = await Api.post("/auth/forgot", { correo, rol: activeRole(e.target) });
      setMessage(msg, res.mensaje);
    } catch (err) {
      setMessage(errorEl, err.message);
    }
    btn.disabled = false;
  });

  /* ---------- Registro ---------- */
  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = activeRole(e.target);
    const emailInput = e.target.querySelector(".reg-email");
    const passInput = e.target.querySelector(".reg-password");
    const passConfirmInput = e.target.querySelector(".reg-password-confirm");
    const phoneInput = e.target.querySelector(".reg-phone");
    const correo = emailInput.value.trim();
    const contrasena = passInput.value;
    const errorEl = document.getElementById("registerError");
    setMessage(errorEl, "");

    if (contrasena !== passConfirmInput.value) {
      setMessage(errorEl, "Las contraseñas no coinciden.");
      return;
    }

    try {
      let payload;
      if (role === "negocio") {
        const nombreNegocio = e.target.querySelector("#fieldsNegocio .reg-name").value.trim();
        const propietario = e.target.querySelector(".reg-owner").value.trim();
        const direccion = e.target.querySelector(".reg-direccion").value.trim();

        if (!nombreNegocio || !propietario || !direccion) {
          setMessage(errorEl, "Completa el nombre del negocio, propietario y dirección.");
          return;
        }
        payload = {
          rol: "negocio",
          nombre_negocio: nombreNegocio,
          propietario,
          correo,
          telefono: phoneInput.value,
          direccion,
          contrasena,
          ciudad: Store.getCity() || "Cartagena",
          categoria_id: catSelect.value,
        };
      } else {
        const nombreCompleto = e.target.querySelector("#fieldsCliente .reg-name").value.trim();
        if (nombreCompleto.length < 3) {
          setMessage(errorEl, "Escribe tu nombre completo (mínimo 3 caracteres).");
          return;
        }
        payload = {
          rol: "cliente",
          nombre_completo: nombreCompleto,
          correo,
          telefono: phoneInput.value,
          contrasena,
          ciudad_actual: Store.getCity() || "Cartagena",
        };
      }

      const result = await Api.post("/auth/register", payload);
      if (role === "negocio") {
        startSession(result, role, payload.nombre_negocio, correo, "panel.html?onboarding=1");
      } else {
        startSession(result, role, payload.nombre_completo, correo);
      }
    } catch (err) {
      setMessage(errorEl, err.message);
    }
  });
});
