document.addEventListener("DOMContentLoaded", () => {
  const token = new URLSearchParams(location.search).get("token") || "";
  const form = document.getElementById("resetForm");
  const errorEl = document.getElementById("resetError");
  const okEl = document.getElementById("resetOk");
  const password = document.getElementById("newPassword");

  function show(el, text) {
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
  }

  if (!token) {
    show(errorEl, "Este enlace no es válido. Solicita uno nuevo desde \"¿Olvidaste tu contraseña?\".");
    form.querySelector("button[type=submit]").disabled = true;
  }

  document.querySelectorAll("[data-toggle-pass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePass);
      const mostrar = input.type === "password";
      input.type = mostrar ? "text" : "password";
      btn.textContent = mostrar ? "Ocultar" : "Mostrar";
    });
  });

  password.addEventListener("input", () => {
    const v = password.value;
    const checks = { len: v.length >= 8, letter: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(v), digit: /\d/.test(v) };
    document.querySelectorAll("#passRules li").forEach((li) => li.classList.toggle("ok", checks[li.dataset.rule]));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    show(errorEl, "");
    if (password.value !== document.getElementById("newPasswordConfirm").value) {
      show(errorEl, "Las contraseñas no coinciden.");
      return;
    }
    const btn = document.getElementById("resetSubmit");
    btn.disabled = true;
    try {
      const res = await Api.post("/auth/reset", { token, contrasena: password.value });
      show(okEl, res.mensaje);
      form.querySelectorAll("input").forEach((i) => (i.disabled = true));
      setTimeout(() => (window.location.href = "auth.html"), 2200);
    } catch (err) {
      show(errorEl, err.message);
      btn.disabled = false;
    }
  });
});
