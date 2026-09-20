// ============================================================
// MODO CLARO / ESCURO
// Liga o botão de alternância no menu. A aplicação do tema salvo
// já acontece antes, num script inline no <head> de cada página
// (evita o "flash" da cor errada ao carregar).
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // #theme-toggle = botão do menu; #pedido-tema = botão da tela cheia de pedido
  document.querySelectorAll("#theme-toggle, #pedido-tema").forEach((botao) => botao.addEventListener("click", () => {
    const escuroAtivo = document.documentElement.getAttribute("data-theme") === "dark";
    if (escuroAtivo) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("cg-tema", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("cg-tema", "dark");
    }
  }));
});

