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

  function render() {
    grid.innerHTML = "";
    const filtrados = categoriaAtiva === "todos"
      ? produtos
      : produtos.filter((p) => p.categoria === categoriaAtiva);

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

  img.addEventListener("click", () => {
    window.abrirZoomImagem(fotosAtuais, indiceAtual, produtoAtual ? produtoAtual.nome : "");
  });

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

    info.innerHTML = `
      <h3>${produto.nome}</h3>
      ${produto.codigo ? `<p class="detalhe-codigo">Cód.: ${produto.codigo}</p>` : ""}
      <p class="detalhe-preco">${formatoPreco(produto.preco)}</p>
      <p class="detalhe-material">${produto.material}</p>
      ${specs ? `<div class="detalhe-specs">${specs}</div>` : ""}
      ${tamanhosHTML ? `<div class="detalhe-tamanhos">${tamanhosHTML}</div>` : ""}
      <p class="detalhe-descricao">${produto.descricao}</p>
      <a class="btn btn-primary" href="pedido.html?produto=${encodeURIComponent(produto.id)}">Pedir esta peça</a>
    `;
  }

  function abrir(produto, elementoOrigem) {
    produtoAtual = produto;
    fotosAtuais = fotosDoProduto(produto);
    indiceAtual = 0;
    img.alt = produto.nome;
    montarInfo(produto);
    elementoQueAbriu = elementoOrigem;
    lightbox.hidden = false;
    window.travarScrollPagina();
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

  grid.addEventListener("click", (evento) => {
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
