/* Visualizador de imagem em tela cheia com zoom ao clicar — funciona em
   desktop (clique) e mobile (toque). Também expõe a trava de scroll da
   página usada pelos modais, corrigindo o bug em que o fundo continuava
   rolando/travando no iOS/Android quando só se usava overflow:hidden. */
(function () {
  let scrollY = 0;

  function travarScrollPagina() {
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("scroll-travado");
  }

  function destravarScrollPagina() {
    document.body.classList.remove("scroll-travado");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
  }

  window.travarScrollPagina = travarScrollPagina;
  window.destravarScrollPagina = destravarScrollPagina;

  let overlay, imgEl, btnPrev, btnNext, btnFechar;
  let fotos = [];
  let indice = 0;
  let ampliado = false;

  function montarOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<button type="button" class="zoom-fechar" aria-label="Fechar">\u2715</button>' +
      '<button type="button" class="zoom-nav zoom-prev" aria-label="Foto anterior" hidden>\u2039</button>' +
      '<img class="zoom-img" src="" alt="">' +
      '<button type="button" class="zoom-nav zoom-next" aria-label="Pr\u00f3xima foto" hidden>\u203a</button>';
    document.body.appendChild(overlay);

    imgEl = overlay.querySelector(".zoom-img");
    btnFechar = overlay.querySelector(".zoom-fechar");
    btnPrev = overlay.querySelector(".zoom-prev");
    btnNext = overlay.querySelector(".zoom-next");

    btnFechar.addEventListener("click", fechar);
    btnPrev.addEventListener("click", (e) => { e.stopPropagation(); anterior(); });
    btnNext.addEventListener("click", (e) => { e.stopPropagation(); proxima(); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    imgEl.addEventListener("click", (e) => { e.stopPropagation(); alternarZoom(e); });
    document.addEventListener("keydown", (e) => {
      if (!overlay || overlay.hidden) return;
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowLeft") anterior();
      if (e.key === "ArrowRight") proxima();
    });
  }

  function mostrar() {
    imgEl.src = fotos[indice];
    imgEl.classList.remove("zoom-ativo");
    ampliado = false;
    const multiplas = fotos.length > 1;
    btnPrev.hidden = !multiplas;
    btnNext.hidden = !multiplas;
  }

  function anterior() { indice = (indice - 1 + fotos.length) % fotos.length; mostrar(); }
  function proxima() { indice = (indice + 1) % fotos.length; mostrar(); }

  function alternarZoom(evento) {
    ampliado = !ampliado;
    if (ampliado) {
      const rect = imgEl.getBoundingClientRect();
      const origemX = evento.clientX ?? (rect.left + rect.width / 2);
      const origemY = evento.clientY ?? (rect.top + rect.height / 2);
      const x = ((origemX - rect.left) / rect.width) * 100;
      const y = ((origemY - rect.top) / rect.height) * 100;
      imgEl.style.transformOrigin = `${x}% ${y}%`;
      imgEl.classList.add("zoom-ativo");
    } else {
      imgEl.classList.remove("zoom-ativo");
    }
  }

  function fechar() {
    overlay.hidden = true;
    destravarScrollPagina();
  }

  window.abrirZoomImagem = function (listaFotos, indiceInicial, alt) {
    montarOverlay();
    fotos = listaFotos;
    indice = indiceInicial || 0;
    imgEl.alt = alt || "";
    overlay.hidden = false;
    travarScrollPagina();
    mostrar();
  };
})();
