// ============================================================
// MODO CLARO / ESCURO
// Liga o botão de alternância no menu. A aplicação do tema salvo
// já acontece antes, num script inline no <head> de cada página
// (evita o "flash" da cor errada ao carregar).
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const botao = document.getElementById("theme-toggle");
  if (!botao) return;
  botao.addEventListener("click", () => {
    const escuroAtivo = document.documentElement.getAttribute("data-theme") === "dark";
    if (escuroAtivo) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("cg-tema", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("cg-tema", "dark");
    }
  });
});

