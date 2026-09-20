/* Visualizador de foto em TELA CHEIA — desktop e celular.
   - Abre ao clicar/tocar na foto (detalhe da peça no catálogo e página de pedido).
   - Fechar: botão "✕ Fechar", tecla Esc, toque/clique fora da foto ou deslizar a foto para baixo.
   - Ampliar: clique/toque na foto amplia no ponto tocado; arraste para mover; toque de novo para voltar.
   - Várias fotos: setas, teclas ← →, ou deslizar para os lados; contador "1 / 3".
   Também expõe a trava de scroll da página usada pelos modais (com contador, para que
   abrir a tela cheia por cima de outro modal não destrave nem faça a página "pular"). */
(function () {
  // ---------------- Trava de scroll (com contador) ----------------
  let travas = 0;
  let scrollSalvo = 0;

  function travarScrollPagina() {
    if (travas++ === 0) {
      scrollSalvo = window.scrollY;
      document.body.style.top = `-${scrollSalvo}px`;
      document.body.classList.add("scroll-travado");
    }
  }

  function destravarScrollPagina() {
    if (travas === 0) return;
    if (--travas === 0) {
      document.body.classList.remove("scroll-travado");
      document.body.style.top = "";
      window.scrollTo(0, scrollSalvo);
    }
  }

  window.travarScrollPagina = travarScrollPagina;
  window.destravarScrollPagina = destravarScrollPagina;

  // ---------------- Visualizador ----------------
  const ESCALA_ZOOM = 2.5;

  let overlay, palco, imgEl, btnPrev, btnNext, btnFechar, contador;
  let fotos = [];
  let indice = 0;
  let escala = 1;
  let tx = 0;
  let ty = 0;
  let arrasto = null;

  function montarOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Foto em tela cheia");
    overlay.innerHTML =
      '<span class="zoom-contador" aria-live="polite"></span>' +
      '<button type="button" class="zoom-fechar" aria-label="Fechar tela cheia"><span aria-hidden="true">\u2715</span> Fechar</button>' +
      '<button type="button" class="zoom-nav zoom-prev" aria-label="Foto anterior" hidden>\u2039</button>' +
      '<div class="zoom-palco"><img class="zoom-img" src="" alt="" draggable="false"></div>' +
      '<button type="button" class="zoom-nav zoom-next" aria-label="Pr\u00f3xima foto" hidden>\u203a</button>' +
      '<p class="zoom-dica">Toque na foto para ampliar \u00b7 toque fora dela para fechar</p>';
    document.body.appendChild(overlay);

    palco = overlay.querySelector(".zoom-palco");
    imgEl = overlay.querySelector(".zoom-img");
    btnFechar = overlay.querySelector(".zoom-fechar");
    btnPrev = overlay.querySelector(".zoom-prev");
    btnNext = overlay.querySelector(".zoom-next");
    contador = overlay.querySelector(".zoom-contador");

    btnFechar.addEventListener("click", fechar);
    btnPrev.addEventListener("click", anterior);
    btnNext.addEventListener("click", proxima);
    imgEl.addEventListener("load", ajustarTamanho);
    window.addEventListener("resize", () => { if (!overlay.hidden) { ajustarTamanho(); restaurar(false); } });

    // Toque/clique, arrastar e deslizar (mouse, toque e caneta)
    palco.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, tx0: tx, ty0: ty, moveu: false, alvo: e.target };
      if (palco.setPointerCapture) {
        try { palco.setPointerCapture(e.pointerId); } catch (erro) { /* ignora */ }
      }
    });
    palco.addEventListener("pointermove", (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const dx = e.clientX - arrasto.x;
      const dy = e.clientY - arrasto.y;
      if (!arrasto.moveu && Math.hypot(dx, dy) > 8) arrasto.moveu = true;
      if (arrasto.moveu && escala > 1) {
        tx = arrasto.tx0 + dx;
        ty = arrasto.ty0 + dy;
        limitarPosicao();
        aplicar(false);
      }
    });
    palco.addEventListener("pointerup", (e) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      const a = arrasto;
      arrasto = null;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (!a.moveu) {
        // toque simples: na foto amplia/volta; fora da foto fecha
        if (a.alvo === imgEl) alternarZoom(e);
        else if (escala > 1) restaurar(true);
        else fechar();
        return;
      }
      if (escala === 1) {
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) proxima(); else anterior();
        } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
          fechar();
        }
      }
    });
    palco.addEventListener("pointercancel", () => { arrasto = null; });

    // Teclado (fase de captura: quando a tela cheia está aberta, os modais por baixo não reagem)
    document.addEventListener("keydown", (e) => {
      if (!overlay || overlay.hidden) return;
      if (e.key === "Escape") fechar();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "ArrowRight") proxima();
      else return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);
  }

  // Encaixa a foto na tela inteira (mantendo a proporção)
  function ajustarTamanho() {
    const nw = imgEl.naturalWidth;
    const nh = imgEl.naturalHeight;
    if (!nw || !nh) return;
    const fator = Math.min(palco.clientWidth / nw, palco.clientHeight / nh);
    imgEl.style.width = `${Math.round(nw * fator)}px`;
    imgEl.style.height = `${Math.round(nh * fator)}px`;
  }

  function aplicar(animar) {
    imgEl.style.transition = animar ? "transform 0.25s ease" : "none";
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${escala})`;
    overlay.classList.toggle("ampliado", escala > 1);
  }

  function limitarPosicao() {
    const maxX = Math.max(0, (imgEl.offsetWidth * escala - palco.clientWidth) / 2);
    const maxY = Math.max(0, (imgEl.offsetHeight * escala - palco.clientHeight) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  function restaurar(animar) {
    escala = 1;
    tx = 0;
    ty = 0;
    aplicar(animar !== false);
  }

  function alternarZoom(evento) {
    if (escala > 1) { restaurar(true); return; }
    const rect = imgEl.getBoundingClientRect();
    const dx = evento.clientX - (rect.left + rect.width / 2);
    const dy = evento.clientY - (rect.top + rect.height / 2);
    escala = ESCALA_ZOOM;
    tx = -(escala - 1) * dx; // mantém o ponto tocado no mesmo lugar
    ty = -(escala - 1) * dy;
    limitarPosicao();
    aplicar(true);
  }

  function mostrar() {
    imgEl.style.width = "";
    imgEl.style.height = "";
    imgEl.src = fotos[indice];
    if (imgEl.complete) ajustarTamanho();
    restaurar(false);
    const multiplas = fotos.length > 1;
    btnPrev.hidden = !multiplas;
    btnNext.hidden = !multiplas;
    contador.hidden = !multiplas;
    contador.textContent = `${indice + 1} / ${fotos.length}`;
  }

  function anterior() { if (fotos.length > 1) { indice = (indice - 1 + fotos.length) % fotos.length; mostrar(); } }
  function proxima() { if (fotos.length > 1) { indice = (indice + 1) % fotos.length; mostrar(); } }

  function fechar() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    arrasto = null;
    destravarScrollPagina();
  }

  window.abrirZoomImagem = function (listaFotos, indiceInicial, alt) {
    if (!listaFotos || !listaFotos.length) return;
    montarOverlay();
    fotos = listaFotos;
    indice = indiceInicial || 0;
    imgEl.alt = alt || "";
    const jaAberto = !overlay.hidden;
    overlay.hidden = false;
    if (!jaAberto) travarScrollPagina();
    mostrar();
    btnFechar.focus();
  };
})();
