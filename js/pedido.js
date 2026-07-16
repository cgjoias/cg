async function carregarProdutos() {
  try {
    const resposta = await fetch("data/produtos.json");
    return await resposta.json();
  } catch (erro) {
    // fetch() é bloqueado quando a página é aberta direto do disco (file://).
    // Nesse caso, usa a cópia embutida em data/produtos.js (carregado no HTML).
    if (window.PRODUTOS_DATA) return window.PRODUTOS_DATA;
    throw erro;
  }
}

function preencherSelectProdutos(select, produtos, idPreSelecionado) {
  select.innerHTML = '<option value="" disabled selected>Escolha uma peça</option>';
  const grupos = {};
  produtos.forEach((p) => {
    grupos[p.categoria] = grupos[p.categoria] || [];
    grupos[p.categoria].push(p);
  });

  const nomesCategoria = { aneis: "Anéis", colares: "Colares", brincos: "Brincos", pulseiras: "Pulseiras" };

  Object.entries(grupos).forEach(([categoria, itens]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = nomesCategoria[categoria] || categoria;
    itens.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = `R$ ${p.preco.toFixed(2).replace(".", ",")} — ${p.nome}`;
      if (p.id === idPreSelecionado) option.selected = true;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
}

function ehPlaceholder(valor) {
  return typeof valor === "string" && /consult|sob consulta/i.test(valor);
}

// Tamanhos cadastrados como par ("22/23") viram dois botões separados: "22" e "23".
// Valores que não são um par numérico (ex.: "Tamanho único (ajustável)") ficam como estão.
function expandirTamanhos(lista) {
  const vistos = new Set();
  const resultado = [];
  lista.forEach((t) => {
    const texto = String(t).trim();
    const partes = /^\d+\s*\/\s*\d+$/.test(texto)
      ? texto.split("/").map((p) => p.trim())
      : [texto];
    partes.forEach((p) => {
      if (!vistos.has(p)) {
        vistos.add(p);
        resultado.push(p);
      }
    });
  });
  // Se todos os itens forem números, ordena crescente (10, 11, 12...).
  if (resultado.every((p) => /^\d+$/.test(p))) {
    resultado.sort((a, b) => Number(a) - Number(b));
  }
  return resultado;
}

function opcoesReaisDoProduto(produto) {
  // Alianças/anéis: usa os tamanhos reais cadastrados no produto (numeração real
  // disponível), em vez da lista genérica 14–24. Quando o produto tem versão
  // feminina e masculina, monta dois grupos separados.
  if (produto.categoria !== "aneis") return null;

  const fem = Array.isArray(produto.tamanhosFeminino) ? expandirTamanhos(produto.tamanhosFeminino.filter((t) => !ehPlaceholder(t))) : [];
  const masc = Array.isArray(produto.tamanhosMasculino) ? expandirTamanhos(produto.tamanhosMasculino.filter((t) => !ehPlaceholder(t))) : [];
  if (fem.length || masc.length) {
    return { grupos: [
      fem.length ? { rotulo: "Aro feminino", opcoes: fem } : null,
      masc.length ? { rotulo: "Aro masculino", opcoes: masc } : null,
    ].filter(Boolean) };
  }

  const tamanhos = Array.isArray(produto.tamanhos) ? expandirTamanhos(produto.tamanhos.filter((t) => !ehPlaceholder(t))) : [];
  if (tamanhos.length) return { grupos: [{ rotulo: null, opcoes: tamanhos }] };

  return null;
}

function renderizarVariacoes(produto) {
  const container = document.getElementById("chips-variacao");
  const campoTexto = document.getElementById("detalhes");
  const label = document.getElementById("detalhes-label");
  const ajuda = document.getElementById("detalhes-ajuda");
  if (!container || !campoTexto) return;

  container.innerHTML = "";

  const reais = produto ? opcoesReaisDoProduto(produto) : null;
  const configCategoria = produto && typeof VARIACOES_POR_CATEGORIA !== "undefined"
    ? VARIACOES_POR_CATEGORIA[produto.categoria]
    : null;

  // Prioridade: variações específicas do produto > tamanhos reais cadastrados
  // (anéis) > lista genérica da categoria.
  const opcoesProduto = produto && Array.isArray(produto.variacoes) && produto.variacoes.length
    ? produto.variacoes
    : null;

  if (opcoesProduto) {
    label.textContent = (configCategoria && configCategoria.rotulo) || "Tamanho / cor / variação";
    campoTexto.hidden = true;
    campoTexto.value = "";
    container.hidden = false;
    ajuda.hidden = false;
    montarChipsSimples(container, campoTexto, opcoesProduto);
    return;
  }

  if (reais) {
    label.textContent = (configCategoria && configCategoria.rotulo) || "Aro (tamanho)";
    campoTexto.hidden = true;
    campoTexto.value = "";
    container.hidden = false;
    ajuda.hidden = false;
    reais.grupos.forEach((grupo) => montarChipsGrupo(container, campoTexto, grupo.rotulo, grupo.opcoes));
    return;
  }

  if (configCategoria && produto) {
    label.textContent = configCategoria.rotulo || "Tamanho / cor / variação";
    campoTexto.hidden = true;
    campoTexto.value = "";
    container.hidden = false;
    ajuda.hidden = false;
    montarChipsSimples(container, campoTexto, configCategoria.opcoes);
    return;
  }

  // Sem opções configuradas para essa peça: volta pro campo de texto livre.
  container.hidden = true;
  ajuda.hidden = true;
  campoTexto.hidden = false;
  campoTexto.placeholder = produto
    ? "Fale com a gente pelo WhatsApp para confirmar o tamanho disponível"
    : "Ex: aro 18, tom dourado";
  label.textContent = "Tamanho / cor / variação";
}

function montarChipsSimples(container, campoTexto, opcoes) {
  const selecionados = new Set();
  const linha = document.createElement("div");
  linha.className = "chips-variacao-linha";
  opcoes.forEach((opcao) => {
    linha.appendChild(criarChip(opcao, selecionados, campoTexto));
  });
  container.appendChild(linha);
}

function montarChipsGrupo(container, campoTexto, rotulo, opcoes) {
  const selecionados = new Set(campoTexto.value ? campoTexto.value.split(", ").filter(Boolean) : []);
  const grupo = document.createElement("div");
  grupo.className = "chips-variacao-grupo";
  if (rotulo) {
    const titulo = document.createElement("span");
    titulo.className = "chips-variacao-rotulo";
    titulo.textContent = rotulo;
    grupo.appendChild(titulo);
  }
  const lista = document.createElement("div");
  lista.className = "chips-variacao-linha";
  opcoes.forEach((opcao) => {
    const valor = rotulo ? `${rotulo}: ${opcao}` : opcao;
    lista.appendChild(criarChip(valor, selecionados, campoTexto, opcao));
  });
  grupo.appendChild(lista);
  container.appendChild(grupo);
}

function criarChip(valor, selecionados, campoTexto, textoExibido) {
  const chip = document.createElement("label");
  chip.className = "chip";
  chip.innerHTML = `<input type="checkbox" value="${valor}"><span>${textoExibido || valor}</span>`;
  chip.querySelector("input").addEventListener("change", (evento) => {
    if (evento.target.checked) selecionados.add(valor);
    else selecionados.delete(valor);
    campoTexto.value = [...selecionados].join(", ");
  });
  return chip;
}

function fotosDoProduto(produto) {
  if (Array.isArray(produto.imagens) && produto.imagens.length) return produto.imagens;
  return produto.imagem ? [produto.imagem] : [];
}

function formatoPrecoPedido(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderizarMedia(produto) {
  const media = document.getElementById("pedido-media");
  const img = document.getElementById("pedido-foto-img");
  const miniaturas = document.getElementById("pedido-foto-miniaturas");
  const btnPrev = document.getElementById("pedido-foto-prev");
  const btnNext = document.getElementById("pedido-foto-next");
  const nome = document.getElementById("pedido-media-nome");
  const codigo = document.getElementById("pedido-media-codigo");
  const preco = document.getElementById("pedido-media-preco");
  if (!media) return;

  const fotos = produto ? fotosDoProduto(produto) : [];
  if (!produto || !fotos.length) {
    media.hidden = true;
    return;
  }

  media.hidden = false;
  nome.textContent = produto.nome;
  codigo.textContent = produto.codigo ? `Cód.: ${produto.codigo}` : "";
  codigo.hidden = !produto.codigo;
  preco.textContent = formatoPrecoPedido(produto.preco);

  let indiceAtual = 0;

  function mostrar() {
    img.src = fotos[indiceAtual];
    img.alt = produto.nome;
    const multiplas = fotos.length > 1;
    btnPrev.hidden = !multiplas;
    btnNext.hidden = !multiplas;
    [...miniaturas.children].forEach((mini, i) => mini.classList.toggle("ativa", i === indiceAtual));
  }

  img.onclick = () => window.abrirZoomImagem(fotos, indiceAtual, produto.nome);

  miniaturas.innerHTML = "";
  if (fotos.length > 1) {
    fotos.forEach((foto, i) => {
      const mini = document.createElement("img");
      mini.src = foto;
      mini.alt = `${produto.nome} — foto ${i + 1}`;
      mini.addEventListener("click", () => { indiceAtual = i; mostrar(); });
      miniaturas.appendChild(mini);
    });
  }

  btnPrev.onclick = () => { indiceAtual = (indiceAtual - 1 + fotos.length) % fotos.length; mostrar(); };
  btnNext.onclick = () => { indiceAtual = (indiceAtual + 1) % fotos.length; mostrar(); };

  mostrar();
}

async function iniciarFormularioPedido() {
  const form = document.getElementById("form-pedido");
  if (!form) return;

  const selectProduto = document.getElementById("produto");
  const erroBox = document.getElementById("pedido-erro");
  const params = new URLSearchParams(window.location.search);
  const produtos = await carregarProdutos();

  preencherSelectProdutos(selectProduto, produtos, params.get("produto"));

  const produtoInicial = produtos.find((p) => p.id === params.get("produto"));
  renderizarVariacoes(produtoInicial || null);
  renderizarMedia(produtoInicial || null);

  selectProduto.addEventListener("change", () => {
    const produto = produtos.find((p) => p.id === selectProduto.value);
    renderizarVariacoes(produto || null);
    renderizarMedia(produto || null);
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erroBox.hidden = true;

    const dados = new FormData(form);
    const produtoEscolhido = produtos.find((p) => p.id === dados.get("produto"));

    const pedido = {
      nome: dados.get("nome").trim(),
      whatsapp: dados.get("whatsapp").trim(),
      endereco: (dados.get("endereco") || "").trim() || null,
      produto_id: produtoEscolhido.id,
      produto_nome: produtoEscolhido.nome,
      categoria: produtoEscolhido.categoria,
      preco: produtoEscolhido.preco,
      detalhes: (dados.get("detalhes") || "").trim() || null,
      observacoes: (dados.get("observacoes") || "").trim() || null,
      status: "Pendente",
    };

    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Enviando...";

    try {
      const { error } = await db.from("pedidos").insert(pedido);
      if (error) throw error;

      sessionStorage.setItem("ultimoPedido", JSON.stringify(pedido));
      window.location.href = "resumo.html";
    } catch (erro) {
      console.error(erro);
      erroBox.hidden = false;
      erroBox.textContent = "Não foi possível enviar seu pedido agora. Verifique sua conexão e tente novamente.";
      botao.disabled = false;
      botao.textContent = "Finalizar pedido";
    }
  });
}

document.addEventListener("DOMContentLoaded", iniciarFormularioPedido);
