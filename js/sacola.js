// ============================================================
// SACOLA + VOLTAR AO TOPO
// Cria dois botões flutuantes em todas as páginas (exceto Gestão):
//   - Voltar ao topo (aparece depois de rolar a página)
//   - Sacola, com contador de peças e painel lateral com a lista
// A sacola fica salva no navegador (localStorage), então continua
// cheia ao trocar de página. O checkout acontece em
// pedido.html?sacola=1 (ver js/pedido.js).
// API pública: window.Sacola (adicionar, remover, limpar, itens, total, abrir, fechar)
// ============================================================
(function () {
  const CHAVE = "cg-sacola";

  const formatar = (valor) =>
    Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function ler() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      return Array.isArray(dados) ? dados : [];
    } catch (erro) {
      return [];
    }
  }

  let itens = ler();

  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(itens));
    } catch (erro) {
      // Sem localStorage (modo privado, por exemplo): a sacola vale só nesta página.
    }
    document.dispatchEvent(new CustomEvent("sacola:mudou"));
  }

  const ICONE_SACOLA =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 10V7a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICONE_SETA =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let elBotaoSacola, elBadge, elBotaoTopo, elOverlay, elPainel, elLista, elVazio, elRodape, elTotal, elToast;
  let ultimoFoco = null;
  let timerToast = null;

  // ---------------- API ----------------
  function total() {
    return itens.reduce((soma, item) => soma + Number(item.preco || 0), 0);
  }

  function atualizarBadge(animar) {
    if (!elBadge) return;
    elBadge.textContent = String(itens.length);
    elBotaoSacola.setAttribute(
      "aria-label",
      `Abrir sacola (${itens.length} ${itens.length === 1 ? "peça" : "peças"})`
    );
    if (animar) {
      elBotaoSacola.classList.remove("pulsar");
      void elBotaoSacola.offsetWidth; // reinicia a animação
      elBotaoSacola.classList.add("pulsar");
    }
  }

  function adicionar(produto) {
    if (!produto || !produto.id) return;
    itens.push({
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      id: produto.id,
      nome: produto.nome,
      preco: Number(produto.preco),
      imagem: produto.imagem || (Array.isArray(produto.imagens) ? produto.imagens[0] : ""),
      categoria: produto.categoria || "",
      detalhes: "",
    });
    gravar();
    atualizarBadge(true);
    renderizarPainel();
    mostrarToast(`${produto.nome} — adicionada à sacola`);
  }

  function remover(uid) {
    itens = itens.filter((item) => item.uid !== uid);
    gravar();
    atualizarBadge(false);
    renderizarPainel();
  }

  function definirDetalhes(uid, texto) {
    const item = itens.find((i) => i.uid === uid);
    if (!item) return;
    item.detalhes = texto;
    gravar();
  }

  function limpar() {
    itens = [];
    gravar();
    atualizarBadge(false);
    renderizarPainel();
  }

  // ---------------- Painel ----------------
  function renderizarPainel() {
    if (!elLista) return;
    elLista.innerHTML = "";

    itens.forEach((item) => {
      const li = document.createElement("li");
      li.className = "sacola-item";

      const foto = document.createElement("img");
      foto.src = item.imagem || "";
      foto.alt = item.nome;
      foto.className = "sacola-item-foto";

      const info = document.createElement("div");
      info.className = "sacola-item-info";

      const nome = document.createElement("p");
      nome.className = "sacola-item-nome";
      nome.textContent = item.nome;

      const preco = document.createElement("p");
      preco.className = "sacola-item-preco";
      preco.textContent = formatar(item.preco);

      const campo = document.createElement("input");
      campo.type = "text";
      campo.className = "sacola-item-detalhes";
      campo.placeholder = "Tamanho / cor (ex.: aro 18)";
      campo.value = item.detalhes || "";
      campo.setAttribute("aria-label", `Tamanho ou cor de ${item.nome}`);
      campo.addEventListener("input", () => definirDetalhes(item.uid, campo.value));

      info.append(nome, preco, campo);

      const btnRemover = document.createElement("button");
      btnRemover.type = "button";
      btnRemover.className = "sacola-item-remover";
      btnRemover.setAttribute("aria-label", `Remover ${item.nome}`);
      btnRemover.textContent = "✕";
      btnRemover.addEventListener("click", () => remover(item.uid));

      li.append(foto, info, btnRemover);
      elLista.appendChild(li);
    });

    const vazia = itens.length === 0;
    elVazio.hidden = !vazia;
    elRodape.hidden = vazia;
    elTotal.textContent = formatar(total());
  }

  function abrir() {
    itens = ler(); // garante que está em dia com outras abas
    atualizarBadge(false);
    renderizarPainel();
    ultimoFoco = document.activeElement;
    elOverlay.classList.add("aberto");
    elPainel.classList.add("aberto");
    elPainel.setAttribute("aria-hidden", "false");
    document.body.classList.add("sacola-aberta");
    elPainel.querySelector(".sacola-fechar").focus();
  }

  function fechar() {
    elOverlay.classList.remove("aberto");
    elPainel.classList.remove("aberto");
    elPainel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sacola-aberta");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function mostrarToast(texto) {
    if (!elToast) return;
    elToast.textContent = texto;
    elToast.classList.add("visivel");
    clearTimeout(timerToast);
    timerToast = setTimeout(() => elToast.classList.remove("visivel"), 2200);
  }

  // ---------------- Montagem ----------------
  function montar() {
    // Voltar ao topo
    elBotaoTopo = document.createElement("button");
    elBotaoTopo.type = "button";
    elBotaoTopo.className = "fab fab-topo";
    elBotaoTopo.setAttribute("aria-label", "Voltar ao topo");
    elBotaoTopo.innerHTML = ICONE_SETA;
    elBotaoTopo.addEventListener("click", () => {
      const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduzir ? "auto" : "smooth" });
    });

    // Sacola
    elBotaoSacola = document.createElement("button");
    elBotaoSacola.type = "button";
    elBotaoSacola.className = "fab fab-sacola";
    elBotaoSacola.innerHTML = `${ICONE_SACOLA}<span class="fab-badge">0</span>`;
    elBadge = elBotaoSacola.querySelector(".fab-badge");
    elBotaoSacola.addEventListener("click", abrir);

    // Painel lateral
    elOverlay = document.createElement("div");
    elOverlay.className = "sacola-overlay";
    elOverlay.addEventListener("click", fechar);

    elPainel = document.createElement("aside");
    elPainel.className = "sacola-painel";
    elPainel.setAttribute("role", "dialog");
    elPainel.setAttribute("aria-modal", "true");
    elPainel.setAttribute("aria-label", "Sua sacola");
    elPainel.setAttribute("aria-hidden", "true");
    elPainel.innerHTML = `
      <div class="sacola-topo">
        <h2>Sua sacola</h2>
        <button type="button" class="sacola-fechar" aria-label="Fechar sacola">✕</button>
      </div>
      <div class="sacola-corpo">
        <ul class="sacola-lista"></ul>
        <div class="sacola-vazio" hidden>
          <p>Sua sacola está vazia.</p>
          <a class="btn btn-line" href="catalogo.html">Ver catálogo</a>
        </div>
      </div>
      <div class="sacola-rodape" hidden>
        <div class="sacola-total"><span>Total</span><strong></strong></div>
        <a class="btn btn-primary" href="pedido.html?sacola=1">Finalizar pedido</a>
        <button type="button" class="sacola-limpar">Esvaziar sacola</button>
      </div>
    `;
    elLista = elPainel.querySelector(".sacola-lista");
    elVazio = elPainel.querySelector(".sacola-vazio");
    elRodape = elPainel.querySelector(".sacola-rodape");
    elTotal = elPainel.querySelector(".sacola-total strong");
    elPainel.querySelector(".sacola-fechar").addEventListener("click", fechar);
    elPainel.querySelector(".sacola-limpar").addEventListener("click", () => {
      if (window.confirm("Esvaziar a sacola?")) limpar();
    });

    elToast = document.createElement("div");
    elToast.className = "sacola-toast";
    elToast.setAttribute("role", "status");
    elToast.setAttribute("aria-live", "polite");

    document.body.append(elBotaoTopo, elBotaoSacola, elOverlay, elPainel, elToast);

    atualizarBadge(false);
    renderizarPainel();

    // Mostra o "voltar ao topo" só depois de rolar um pouco
    const aoRolar = () => elBotaoTopo.classList.toggle("visivel", window.scrollY > 400);
    window.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();

    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && elPainel.classList.contains("aberto")) fechar();
    });

    // Mantém contador e lista em dia se a sacola mudar em outra aba
    window.addEventListener("storage", (evento) => {
      if (evento.key !== CHAVE) return;
      itens = ler();
      atualizarBadge(false);
      renderizarPainel();
    });
  }

  window.Sacola = {
    adicionar,
    remover,
    limpar,
    abrir,
    fechar,
    itens: () => ler(),
    total,
  };

  document.addEventListener("DOMContentLoaded", montar);
})();
