// ---------- Frete (CEP -> endereço automático -> cálculo via Melhor Envio) ----------
let freteEscolhido = null; // { servico, valor, prazo } ou null

function formatarCep(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function buscarEnderecoPorCep(cepLimpo) {
  const campoEndereco = document.getElementById("endereco");
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const dados = await resp.json();
    if (dados.erro) return null;
    if (campoEndereco && !campoEndereco.value.trim()) {
      campoEndereco.value = [dados.logradouro, dados.bairro, dados.localidade && `${dados.localidade}/${dados.uf}`].filter(Boolean).join(", ");
    }
    return dados; // { uf, localidade, ... }
  } catch (e) {
    console.warn("Não foi possível buscar o endereço pelo CEP:", e);
    return null;
  }
}

function valorFretePorEndereco(uf, cidade) {
  if (uf === "PA" && /bel[eé]m/i.test(cidade || "")) return FRETE_BELEM_CAPITAL;
  return FRETE_POR_UF[uf] ?? FRETE_PADRAO;
}

function renderizarOpcaoFrete(valor) {
  const wrap = document.getElementById("frete-opcoes-wrap");
  const lista = document.getElementById("frete-opcoes");
  const status = document.getElementById("frete-status");
  if (!wrap || !lista) return;

  freteEscolhido = { servico: "Frete (PAC estimado)", valor, prazo: null };
  lista.innerHTML = `<p class="chip-frete" style="font-weight:600;">PAC estimado — R$ ${valor.toFixed(2).replace(".", ",")}</p>`;
  status.hidden = true;
  wrap.hidden = false;
  document.dispatchEvent(new CustomEvent("frete:mudou"));
}

async function calcularFrete() {
  const campoCep = document.getElementById("cep");
  const botao = document.getElementById("btn-calcular-frete");
  const status = document.getElementById("frete-status");
  const wrap = document.getElementById("frete-opcoes-wrap");
  if (!campoCep) return;

  const cepLimpo = campoCep.value.replace(/\D/g, "");
  if (cepLimpo.length !== 8) {
    wrap.hidden = false;
    status.hidden = false;
    status.textContent = "Digite um CEP válido (8 dígitos).";
    document.getElementById("frete-opcoes").innerHTML = "";
    return;
  }

  botao.disabled = true;
  const textoOriginal = botao.textContent;
  botao.textContent = "Calculando...";

  try {
    const endereco = await buscarEnderecoPorCep(cepLimpo);
    if (!endereco) throw new Error("CEP não encontrado");
    const valor = valorFretePorEndereco(endereco.uf, endereco.localidade);
    renderizarOpcaoFrete(valor);
  } catch (e) {
    console.error(e);
    wrap.hidden = false;
    status.hidden = false;
    status.textContent = "Não foi possível calcular o frete pra esse CEP. Confirme e tente de novo.";
    document.getElementById("frete-opcoes").innerHTML = "";
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

function ligarModoFrete() {
  const radioCalcular = document.getElementById("modo-frete-calcular");
  const radioCombinar = document.getElementById("modo-frete-combinar");
  const bloco = document.getElementById("bloco-cep-frete");
  if (!radioCalcular || !radioCombinar || !bloco) return;

  const atualizar = () => {
    if (radioCombinar.checked) {
      bloco.hidden = true;
      freteEscolhido = null;
      document.dispatchEvent(new CustomEvent("frete:mudou"));
    } else {
      bloco.hidden = false;
    }
  };
  radioCalcular.addEventListener("change", atualizar);
  radioCombinar.addEventListener("change", atualizar);
  atualizar();
}

function ligarCampoFrete() {
  const campoCep = document.getElementById("cep");
  const botao = document.getElementById("btn-calcular-frete");
  if (!campoCep || !botao) return;
  campoCep.addEventListener("input", () => { campoCep.value = formatarCep(campoCep.value); });
  botao.addEventListener("click", calcularFrete);
  ligarModoFrete();
}

function dadosFreteParaPedido() {
  if (!freteEscolhido) return { cep: null, frete_servico: null, frete_valor: null, frete_prazo: null };
  const campoCep = document.getElementById("cep");
  return {
    cep: campoCep ? campoCep.value.replace(/\D/g, "") : null,
    frete_servico: freteEscolhido.servico,
    frete_valor: freteEscolhido.valor,
    frete_prazo: freteEscolhido.prazo,
  };
}

async function carregarProdutos() {
  return window.carregarProdutosSite();
}

function preencherSelectProdutos(select, produtos, idPreSelecionado) {
  select.innerHTML = '<option value="" disabled selected>Escolha uma peça</option>';
  const grupos = {};
  produtos.forEach((p) => {
    grupos[p.categoria] = grupos[p.categoria] || [];
    grupos[p.categoria].push(p);
  });

  const nomesCategoria = { aliancas: "Alianças", aneis: "Anéis", colares: "Colares", brincos: "Brincos", pulseiras: "Pulseiras" };

  Object.entries(grupos).forEach(([categoria, itens]) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = nomesCategoria[categoria] || categoria;
    itens.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      const valor = `R$ ${window.menorPreco(p).toFixed(2).replace(".", ",")}`;
      option.textContent = `${window.opcoesDePreco(p) ? "a partir de " : ""}${valor} — ${p.nome}`;
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
  // Mantém a numeração exatamente como está no catálogo — "10/11" é uma opção só,
  // não duas (antes isso virava dois chips separados, "10" e "11").
  const vistos = new Set();
  const resultado = [];
  lista.forEach((t) => {
    const texto = String(t).trim();
    if (texto && !vistos.has(texto)) {
      vistos.add(texto);
      resultado.push(texto);
    }
  });
  // Ordena crescente quando dá pra comparar numericamente (10, 10/11, 12/13...),
  // usando o primeiro número de cada opção.
  const primeiroNumero = (s) => parseInt(String(s).split("/")[0], 10);
  if (resultado.every((p) => /^\d+(\s*\/\s*\d+)?$/.test(p))) {
    resultado.sort((a, b) => primeiroNumero(a) - primeiroNumero(b));
  }
  return resultado;
}

function opcoesReaisDoProduto(produto) {
  // Alianças/anéis: usa os tamanhos reais cadastrados no produto (numeração real
  // disponível), em vez da lista genérica 14–24. Quando o produto tem versão
  // feminina e masculina, monta dois grupos separados.
  if (produto.categoria !== "aneis" && produto.categoria !== "aliancas") return null;

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
  container.classList.remove("chips-variacao--duplo");

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
    // Com feminino + masculino juntos, empilhar os dois grupos toma altura demais e empurra
    // o resto do formulário pra fora da tela no desktop. Com essa classe o CSS bota os dois
    // grupos lado a lado (só quando cabe — no celular continua empilhado).
    container.classList.toggle("chips-variacao--duplo", reais.grupos.length > 1);
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

// ---------- Valor por tipo de venda (Par / Unidade / Trio) ----------
let opcaoPrecoEscolhida = "";

function rotuloEscolhido(produto) {
  return window.opcoesDePreco(produto) ? opcaoPrecoEscolhida : "";
}

function precoEscolhido(produto) {
  return window.precoDaOpcao(produto, opcaoPrecoEscolhida);
}

function renderizarOpcoesPreco(produto, opcaoInicial) {
  const campo = document.getElementById("campo-preco-opcao");
  const caixa = document.getElementById("preco-opcoes-pedido");
  if (!campo || !caixa) return;
  if (!window.opcoesDePreco(produto)) {
    opcaoPrecoEscolhida = "";
    campo.hidden = true;
    caixa.innerHTML = "";
    return;
  }
  caixa.innerHTML = window.htmlOpcoesPreco(produto, "opcao-preco", opcaoInicial);
  const marcada = caixa.querySelector("input:checked");
  opcaoPrecoEscolhida = marcada ? marcada.value : "";
  campo.hidden = false;
  caixa.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      opcaoPrecoEscolhida = input.value;
      const preco = document.getElementById("pedido-media-preco");
      if (preco) preco.textContent = formatoPrecoPedido(precoEscolhido(produto));
    });
  });
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
  preco.textContent = formatoPrecoPedido(precoEscolhido(produto));

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

// Pedido com várias peças (vindo da sacola): pedido.html?sacola=1
// Cada peça vira uma linha na tabela "pedidos" (mesma estrutura de sempre),
// todas com os mesmos dados do cliente.
function iniciarModoSacola(form, erroBox) {
  const bloco = document.getElementById("pedido-sacola");
  const lista = document.getElementById("pedido-sacola-lista");
  const totalEl = document.getElementById("pedido-sacola-total");
  const selectProduto = document.getElementById("produto");

  // Esconde os campos de peça única
  selectProduto.required = false;
  selectProduto.disabled = true;
  selectProduto.closest(".field").style.display = "none";
  document.getElementById("detalhes").closest(".field").style.display = "none";
  document.getElementById("pedido-media").hidden = true;
  bloco.hidden = false;

  function renderizar() {
    const itens = window.Sacola.itens();
    lista.innerHTML = "";
    itens.forEach((item) => {
      const li = document.createElement("li");
      const img = document.createElement("img");
      img.src = item.imagem || "";
      img.alt = item.nome;
      const texto = document.createElement("div");
      const nome = document.createElement("p");
      nome.className = "ps-nome";
      nome.textContent = item.nome;
      const info = document.createElement("p");
      info.className = "ps-info";
      info.textContent = `${item.opcao ? item.opcao + " · " : ""}${formatoPrecoPedido(item.preco)}${item.detalhes ? " · " + item.detalhes : ""}`;
      texto.append(nome, info);
      li.append(img, texto);
      lista.appendChild(li);
    });
    const frete = freteEscolhido ? freteEscolhido.valor : 0;
    totalEl.textContent = formatoPrecoPedido(window.Sacola.total() + frete);
  }
  renderizar();
  document.addEventListener("sacola:mudou", renderizar);
  document.addEventListener("frete:mudou", renderizar);
  ligarCampoFrete();
  document.getElementById("pedido-sacola-editar").addEventListener("click", () => window.Sacola.abrir());

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    erroBox.hidden = true;

    const itens = window.Sacola.itens();
    if (!itens.length) {
      erroBox.hidden = false;
      erroBox.textContent = "Sua sacola está vazia. Adicione peças pelo catálogo.";
      return;
    }

    const dados = new FormData(form);
    const comuns = {
      nome: dados.get("nome").trim(),
      whatsapp: dados.get("whatsapp").trim(),
      ...emailDoForm(dados),
      endereco: (dados.get("endereco") || "").trim() || null,
      observacoes: (dados.get("observacoes") || "").trim() || null,
      status: "Pendente",
    };
    const freteDados = dadosFreteParaPedido();
    const linhas = itens.map((item, i) => ({
      ...comuns,
      produto_id: item.id,
      produto_nome: item.nome,
      categoria: item.categoria || "",
      preco: item.preco,
      detalhes: [item.opcao ? `Tipo: ${item.opcao}` : "", (item.detalhes || "").trim()].filter(Boolean).join(" · ") || null,
      cep: freteDados.cep,
      frete_servico: i === 0 ? freteDados.frete_servico : null,
      frete_valor: i === 0 ? freteDados.frete_valor : null,
      frete_prazo: i === 0 ? freteDados.frete_prazo : null,
    }));

    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Enviando...";

    try {
      const { error } = await db.from("pedidos").insert(linhas);
      if (error) throw error;

      try {
        if (window.notificarPedido) await window.notificarPedido({
          ...comuns,
          itens: linhas.map((l) => ({ nome: l.produto_nome, preco: l.preco, detalhes: l.detalhes })),
        });
      } catch (e) { console.warn("Alerta por e-mail falhou (o pedido foi salvo):", e); }

      sessionStorage.setItem("ultimoPedido", JSON.stringify({
        ...comuns,
        itens: linhas.map((l) => ({ produto_nome: l.produto_nome, preco: l.preco, detalhes: l.detalhes })),
        produto_nome: linhas.map((l) => l.produto_nome).join("; "),
        preco: linhas.reduce((soma, l) => soma + Number(l.preco), 0),
      }));
      window.Sacola.limpar();
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

// ---------- WhatsApp com máscara: (11) 9 9999-9999 ----------
function formatarWhats(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2), resto = d.slice(2);
  if (resto[0] === "9") {
    // celular: (11) 9 9999-9999
    let t = `(${ddd}) ${resto[0]}`;
    if (resto.length > 1) t += ` ${resto.slice(1, 5)}`;
    if (resto.length > 5) t += `-${resto.slice(5)}`;
    return t;
  }
  // fixo: (11) 3333-3333
  return `(${ddd}) ${resto.slice(0, 4)}${resto.length > 4 ? "-" + resto.slice(4) : ""}`;
}

function ligarMascaraWhats() {
  const campo = document.getElementById("whatsapp");
  if (!campo) return;
  const validar = () => {
    const n = campo.value.replace(/\D/g, "").length;
    campo.setCustomValidity(n === 10 || n === 11 ? "" : "Informe o DDD e o número. Ex.: (11) 9 9999-9999");
  };
  campo.addEventListener("input", () => { campo.value = formatarWhats(campo.value); validar(); });
  campo.value = formatarWhats(campo.value);
  validar();
}

// E-mail é opcional: só entra no pedido se o cliente preencheu.
function emailDoForm(dados) {
  const email = String(dados.get("email") || "").trim();
  return email ? { email } : {};
}

async function iniciarFormularioPedido() {
  const form = document.getElementById("form-pedido");
  if (!form) return;
  ligarMascaraWhats();

  const selectProduto = document.getElementById("produto");
  const erroBox = document.getElementById("pedido-erro");
  const params = new URLSearchParams(window.location.search);

  if (params.get("sacola") === "1" && window.Sacola && window.Sacola.itens().length > 0) {
    iniciarModoSacola(form, erroBox);
    return;
  }

  ligarCampoFrete();

  const produtos = await carregarProdutos();

  preencherSelectProdutos(selectProduto, produtos, params.get("produto"));

  const produtoInicial = produtos.find((p) => p.id === params.get("produto"));
  renderizarOpcoesPreco(produtoInicial || null, params.get("opcao"));
  renderizarVariacoes(produtoInicial || null);
  renderizarMedia(produtoInicial || null);

  selectProduto.addEventListener("change", () => {
    const produto = produtos.find((p) => p.id === selectProduto.value);
    renderizarOpcoesPreco(produto || null);
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
      ...emailDoForm(dados),
      endereco: (dados.get("endereco") || "").trim() || null,
      produto_id: produtoEscolhido.id,
      produto_nome: produtoEscolhido.nome,
      categoria: produtoEscolhido.categoria,
      preco: precoEscolhido(produtoEscolhido),
      detalhes: [rotuloEscolhido(produtoEscolhido) ? `Tipo: ${rotuloEscolhido(produtoEscolhido)}` : "", (dados.get("detalhes") || "").trim()].filter(Boolean).join(" · ") || null,
      observacoes: (dados.get("observacoes") || "").trim() || null,
      status: "Pendente",
      ...dadosFreteParaPedido(),
    };

    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Enviando...";

    try {
      const { error } = await db.from("pedidos").insert(pedido);
      if (error) throw error;

      try {
        if (window.notificarPedido) await window.notificarPedido({
          ...pedido,
          itens: [{ nome: pedido.produto_nome, preco: pedido.preco, detalhes: pedido.detalhes }],
        });
      } catch (e) { console.warn("Alerta por e-mail falhou (o pedido foi salvo):", e); }

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
