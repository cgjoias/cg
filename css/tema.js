// ============================================================
// MODO CLARO / ESCURO
// Liga o botão de alternância no menu. A aplicação do tema salvo
// já acontece antes, num script inline no <head> de cada página
// (evita o "flash" da cor errada ao carregar).
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  // #theme-toggle = botão do menu; #pedido-tema = tela cheia de pedido; #lightbox-tema = painel de detalhes do catálogo
  document.querySelectorAll("#theme-toggle, #pedido-tema, #lightbox-tema").forEach((botao) => botao.addEventListener("click", () => {
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

