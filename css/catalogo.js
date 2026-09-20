// ============================================================
// BOTÕES DO TOPO DO PAINEL DE DETALHES: [ ☀️/🌙 tema ] [ ❌ fechar ]
// Monta (ou completa) o grupo de botões sozinho, então funciona
// mesmo que o catalogo.html seja uma versão mais antiga. O botão de
// tema usa um id próprio, pra o tema.js não ligar o clique duas vezes.
// ============================================================
(function montarBotoesDoDetalhe() {
  const painel = document.querySelector(".detalhe-painel");
  const fechar = document.getElementById("lightbox-fechar");
  if (!painel || !fechar) return;

  let grupo = painel.querySelector(".lightbox-acoes");
  if (!grupo) {
    grupo = document.createElement("div");
    grupo.className = "lightbox-acoes";
    painel.insertBefore(grupo, fechar);
    grupo.appendChild(fechar);
  }

  let tema = grupo.querySelector(".lightbox-tema");
  if (!tema) {
    tema = document.createElement("button");
    tema.className = "lightbox-tema";
    tema.innerHTML =
      '<span class="emo icon-sol" aria-hidden="true">☀️</span>' +
      '<span class="emo icon-lua" aria-hidden="true">🌙</span>';
    grupo.insertBefore(tema, fechar);
  }
  tema.type = "button";
  tema.id = "lightbox-tema-cg";
  tema.setAttribute("aria-label", "Alternar modo claro/escuro");
  tema.title = "Alternar modo claro/escuro";
  tema.addEventListener("click", () => {
    const escuro = document.documentElement.getAttribute("data-theme") === "dark";
    if (escuro) {
      document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("cg-tema", "light"); } catch (e) {}
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("cg-tema", "dark"); } catch (e) {}
    }
  });

  // Fechar vira o ❌ redondo (igual ao da tela de pedido)
  fechar.innerHTML = '<span class="emo" aria-hidden="true">❌</span>';
  fechar.setAttribute("aria-label", "Fechar detalhes");
  fechar.title = "Fechar";
})();

const CATEGORIAS = {
  todos: "Todos",
  aneis: "Anéis",
  colares: "Colares",
  brincos: "Brincos",
  pulseiras: "Pulseiras",
};

const formatoPreco = (valor) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function cardProduto(produto) {
  const card = document.createElement("article");
  card.className = "produto-card";
  card.dataset.produtoId = produto.id;
  card.innerHTML = `
    <div class="medallion produto-medalhao" data-produto-id="${produto.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${produto.nome}">
      <div class="medallion-inner">
        <img src="${produto.imagem}" alt="${produto.nome}">
      </div>
    </div>
    <h3>${produto.nome}</h3>
    <p class="produto-material">${produto.material}</p>
    <p class="produto-preco">${formatoPreco(produto.preco)}</p>
    ${produto.codigo ? `<p class="produto-codigo">Cód.: ${produto.codigo}</p>` : ""}
    <a class="btn btn-line" href="pedido.html?produto=${encodeURIComponent(produto.id)}">Pedir esta peça</a>
    <button type="button" class="btn btn-sacola" data-sacola-add data-produto-id="${produto.id}">Adicionar à sacola</button>
  `;
  return card;
}

async function iniciarCatalogo() {
  const grid = document.getElementById("grid-produtos");
  const tabs = document.getElementById("tabs-categoria");
  const vazio = document.getElementById("catalogo-vazio");
  if (!grid) return;

  let produtos = [];
  try {
    const resposta = await fetch("data/produtos.json");
    produtos = await resposta.json();
  } catch (erro) {
    // fetch() é bloqueado quando a página é aberta direto do disco (file://).
    // Nesse caso, usa a cópia embutida em data/produtos.js (carregado no HTML).
    if (window.PRODUTOS_DATA) {
      produtos = window.PRODUTOS_DATA;
    } else {
      grid.innerHTML = "<p>Não foi possível carregar o catálogo agora. Tente novamente em instantes.</p>";
      return;
    }
  }

  const params = new URLSearchParams(window.location.search);
  let categoriaAtiva = params.get("categoria") || "todos";
  const campoBusca = document.getElementById("busca-produto");
  let termoBusca = "";

  function render() {
    grid.innerHTML = "";
    let filtrados = categoriaAtiva === "todos"
      ? produtos
      : produtos.filter((p) => p.categoria === categoriaAtiva);

    if (termoBusca) {
      const termo = termoBusca.trim().toLowerCase();
      filtrados = filtrados.filter((p) =>
        (p.nome && p.nome.toLowerCase().includes(termo)) ||
        (p.codigo && p.codigo.toLowerCase().includes(termo))
      );
    }

    filtrados.forEach((produto) => grid.appendChild(cardProduto(produto)));
    vazio.hidden = filtrados.length !== 0;

    [...tabs.children].forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.categoria === categoriaAtiva);
    });
  }

  tabs.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-categoria]");
    if (!botao) return;
    categoriaAtiva = botao.dataset.categoria;
    const url = new URL(window.location);
    url.searchParams.set("categoria", categoriaAtiva);
    window.history.replaceState({}, "", url);
    render();
  });

  if (campoBusca) {
    campoBusca.addEventListener("input", (evento) => {
      termoBusca = evento.target.value;
      render();
    });
  }

  render();
  iniciarLightbox(produtos, grid);
}

const ROTULOS_SPEC = {
  largura: "Largura",
  cor: "Cor",
  formato: "Formato externo",
  acabamento: "Acabamento",
  pedra: "Pedra",
  detalhes: "Detalhes",
};

function fotosDoProduto(produto) {
  if (Array.isArray(produto.imagens) && produto.imagens.length) return produto.imagens;
  return [produto.imagem];
}

function blocoTamanhos(rotulo, tamanhos) {
  if (!Array.isArray(tamanhos) || !tamanhos.length) return "";
  const chips = tamanhos.map((t) => `<span class="tamanho-chip">${t}</span>`).join("");
  return `
    <div class="detalhe-tamanhos-grupo">
      ${rotulo ? `<span class="detalhe-tamanhos-rotulo">${rotulo}</span>` : ""}
      <div class="detalhe-tamanhos-lista">${chips}</div>
    </div>
  `;
}

function iniciarLightbox(produtos, grid) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightbox-img");
  const btnFechar = document.getElementById("lightbox-fechar");
  const btnPrev = document.getElementById("lightbox-prev");
  const btnNext = document.getElementById("lightbox-next");
  const info = document.getElementById("detalhe-info");
  if (!lightbox) return;

  let fotosAtuais = [];
  let indiceAtual = 0;
  let elementoQueAbriu = null;

  let produtoAtual = null;

  function mostrarFoto() {
    img.src = fotosAtuais[indiceAtual];
    const multiplas = fotosAtuais.length > 1;
    btnPrev.hidden = !multiplas;
    btnNext.hidden = !multiplas;
  }

  // Foto em tela cheia: clique na foto ou no botão "Tela cheia"
  function abrirTelaCheia() {
    if (!fotosAtuais.length) return;
    window.abrirZoomImagem(fotosAtuais, indiceAtual, produtoAtual ? produtoAtual.nome : "");
  }
  img.addEventListener("click", abrirTelaCheia);
  const btnTelaCheia = document.getElementById("ampliar-foto");
  if (btnTelaCheia) btnTelaCheia.addEventListener("click", abrirTelaCheia);

  function montarInfo(produto) {
    const specs = Object.entries(ROTULOS_SPEC)
      .filter(([chave]) => produto[chave])
      .map(([chave, rotulo]) => `
        <div class="detalhe-spec-linha">
          <span>${rotulo}</span>
          <span>${produto[chave]}</span>
        </div>
      `)
      .join("");

    const tamanhosHTML = produto.tamanhosFeminino || produto.tamanhosMasculino
      ? blocoTamanhos("Feminino", produto.tamanhosFeminino) + blocoTamanhos("Masculino", produto.tamanhosMasculino)
      : blocoTamanhos("Tamanhos disponíveis", produto.tamanhos);

    info.innerHTML = `<div class="detalhe-info-conteudo">
      <h3>${produto.nome}</h3>
      ${produto.codigo ? `<p class="detalhe-codigo">Cód.: ${produto.codigo}</p>` : ""}
      <p class="detalhe-preco">${formatoPreco(produto.preco)}</p>
      <p class="detalhe-material">${produto.material}</p>
      ${specs ? `<div class="detalhe-specs">${specs}</div>` : ""}
      ${tamanhosHTML ? `<div class="detalhe-tamanhos">${tamanhosHTML}</div>` : ""}
      <p class="detalhe-descricao">${produto.descricao}</p>
      <div class="detalhe-info-acoes">
        <a class="btn btn-primary" href="pedido.html?produto=${encodeURIComponent(produto.id)}">Pedir esta peça</a>
        <button type="button" class="btn btn-sacola" data-sacola-add data-produto-id="${produto.id}">Adicionar à sacola</button>
      </div>
    </div>`;
  }

  // Painel em tela cheia SEM rolagem: se o conteúdo passar da altura disponível,
  // reduz o tamanho (zoom) só o suficiente para caber.
  function ajustarInfo() {
    const conteudo = info.firstElementChild;
    if (!conteudo || lightbox.hidden) return;
    conteudo.style.zoom = "";
    let z = 1;
    while (z > 0.55 && info.scrollHeight > info.clientHeight) {
      z = Math.round((z - 0.04) * 100) / 100;
      conteudo.style.zoom = String(z);
    }
  }
  window.addEventListener("resize", ajustarInfo);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarInfo);

  function abrir(produto, elementoOrigem) {
    produtoAtual = produto;
    fotosAtuais = fotosDoProduto(produto);
    indiceAtual = 0;
    img.alt = produto.nome;
    montarInfo(produto);
    elementoQueAbriu = elementoOrigem;
    lightbox.hidden = false;
    window.travarScrollPagina();
    ajustarInfo();
    mostrarFoto();
    btnFechar.focus();
  }

  function fechar() {
    lightbox.hidden = true;
    window.destravarScrollPagina();
    if (elementoQueAbriu) elementoQueAbriu.focus();
  }

  function anterior() {
    indiceAtual = (indiceAtual - 1 + fotosAtuais.length) % fotosAtuais.length;
    mostrarFoto();
  }

  function proxima() {
    indiceAtual = (indiceAtual + 1) % fotosAtuais.length;
    mostrarFoto();
  }

  // "Adicionar à sacola" — no cartão e no painel de detalhes
  function adicionarNaSacola(botao) {
    const produto = produtos.find((p) => p.id === botao.dataset.produtoId);
    if (!produto || !window.Sacola) return;
    window.Sacola.adicionar(produto);
    const textoOriginal = botao.textContent;
    botao.textContent = "✓ Adicionada";
    botao.disabled = true;
    setTimeout(() => { botao.textContent = textoOriginal; botao.disabled = false; }, 1200);
  }

  info.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-sacola-add]");
    if (botao) adicionarNaSacola(botao);
  });

  grid.addEventListener("click", (evento) => {
    const botaoSacola = evento.target.closest("[data-sacola-add]");
    if (botaoSacola) { adicionarNaSacola(botaoSacola); return; }
    if (evento.target.closest("a.btn")) return;
    const cartao = evento.target.closest(".produto-card");
    if (!cartao) return;
    const produto = produtos.find((p) => p.id === cartao.dataset.produtoId);
    if (produto) abrir(produto, cartao);
  });

  grid.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    const medalhao = evento.target.closest(".produto-medalhao");
    if (!medalhao) return;
    evento.preventDefault();
    const produto = produtos.find((p) => p.id === medalhao.dataset.produtoId);
    if (produto) abrir(produto, medalhao);
  });

  btnFechar.addEventListener("click", fechar);
  btnPrev.addEventListener("click", anterior);
  btnNext.addEventListener("click", proxima);
  lightbox.addEventListener("click", (evento) => {
    if (evento.target === lightbox) fechar();
  });
  document.addEventListener("keydown", (evento) => {
    if (lightbox.hidden) return;
    if (evento.key === "Escape") fechar();
    if (evento.key === "ArrowLeft") anterior();
    if (evento.key === "ArrowRight") proxima();
  });
}

document.addEventListener("DOMContentLoaded", iniciarCatalogo);
