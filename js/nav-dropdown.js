// ============================================================
// MENU SUSPENSO (DROPDOWN) DO TOPO
// Controla abrir/fechar do dropdown "Mais" que reúne todas as
// páginas do site em um único menu.
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // ---------- Menu hambúrguer (mobile) ----------
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const estaAberto = navLinks.classList.toggle("open");
      navToggle.classList.toggle("open", estaAberto);
      navToggle.setAttribute("aria-expanded", estaAberto ? "true" : "false");
    });

    // Fecha automaticamente ao clicar/tocar fora do menu
    document.addEventListener("click", (evento) => {
      if (
        navLinks.classList.contains("open") &&
        !navLinks.contains(evento.target) &&
        !navToggle.contains(evento.target)
      ) {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Fecha com a tecla Esc
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && navLinks.classList.contains("open")) {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });

    // Fecha o menu ao clicar em um link (evita ficar aberto ao navegar)
    navLinks.addEventListener("click", (evento) => {
      if (evento.target.tagName === "A") {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- Dropdown "Mais" (desktop/mobile) ----------
  const dropdowns = document.querySelectorAll(".nav-dropdown");

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector(".nav-dropdown-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const estaAberto = dropdown.classList.toggle("open");
      toggle.setAttribute("aria-expanded", estaAberto ? "true" : "false");

      dropdowns.forEach((outro) => {
        if (outro !== dropdown) {
          outro.classList.remove("open");
          outro.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
        }
      });
    });
  });

  document.addEventListener("click", (evento) => {
    dropdowns.forEach((dropdown) => {
      if (dropdown.classList.contains("open") && !dropdown.contains(evento.target)) {
        dropdown.classList.remove("open");
        dropdown.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
      }
    });
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
      dropdowns.forEach((dropdown) => {
        dropdown.classList.remove("open");
        dropdown.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
      });
    }
  });
});
