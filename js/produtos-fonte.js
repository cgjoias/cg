// ============================================================
// FONTE DOS PRODUTOS DO SITE
// Lê os produtos do Supabase (tabela "produtos", editada no painel
// Gestão). Se o Supabase estiver fora do ar, ainda não configurado
// ou vazio, usa data/produtos.json (e data/produtos.js como reserva).
// ============================================================

function linhaParaProduto(r) {
  const p = {
    id: r.id,
    nome: r.nome,
    categoria: r.categoria,
    material: r.material || "",
    preco: Number(r.preco) || 0,
    descricao: r.descricao || "",
  };
  ["codigo", "largura", "cor", "formato", "acabamento", "pedra", "detalhes"].forEach((k) => {
    if (r[k]) p[k] = r[k];
  });
  const lista = (v) => (Array.isArray(v) && v.length ? v : null);
  if (lista(r.tamanhos)) p.tamanhos = r.tamanhos;
  if (lista(r.tamanhos_feminino)) p.tamanhosFeminino = r.tamanhos_feminino;
  if (lista(r.tamanhos_masculino)) p.tamanhosMasculino = r.tamanhos_masculino;
  if (lista(r.variacoes)) p.variacoes = r.variacoes;
  // Valores por tipo de venda (ex.: aliança = Par / Unidade / Trio). Quando existem,
  // o "preco" do produto passa a ser o da primeira opção (usado como preço base).
  if (lista(r.precos)) {
    const ops = r.precos
      .map((o) => ({ rotulo: String((o && o.rotulo) || "").trim(), valor: Number(o && o.valor) }))
      .filter((o) => o.rotulo && o.valor > 0);
    if (ops.length) {
      p.precos = ops;
      p.preco = ops[0].valor;
    }
  }
  const imgs = Array.isArray(r.imagens) ? r.imagens.filter(Boolean) : [];
  p.imagem = imgs[0] || "assets/img/marca/logo.jpg";
  if (imgs.length) p.imagens = imgs;
  return p;
}

window.carregarProdutosSite = async function () {
  try {
    if (typeof db !== "undefined") {
      const consulta = db.from("produtos").select("*").order("ordem").order("created_at");
      const limite = new Promise((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), 6000));
      const { data, error } = await Promise.race([consulta, limite]);
      // Tabela vazia = ainda não importada: usa o produtos.json.
      if (!error && Array.isArray(data) && data.length) {
        return data.filter((r) => r.ativo).map(linhaParaProduto);
      }
    }
  } catch (erro) {
    // segue para a reserva abaixo
  }
  try {
    const resposta = await fetch("data/produtos.json");
    return await resposta.json();
  } catch (erro) {
    // fetch() é bloqueado quando a página é aberta direto do disco (file://).
    if (window.PRODUTOS_DATA) return window.PRODUTOS_DATA;
    throw erro;
  }
};

// ============================================================
// VALORES POR TIPO DE VENDA (Par / Unidade / Trio)
// Funções usadas pelo catálogo, pela sacola e pelo formulário de pedido.
// ============================================================
window.opcoesDePreco = function (produto) {
  return produto && Array.isArray(produto.precos) && produto.precos.length ? produto.precos : null;
};

// Preço da opção escolhida (ou o preço normal, se a peça não tem opções).
window.precoDaOpcao = function (produto, rotulo) {
  const ops = window.opcoesDePreco(produto);
  if (!ops) return Number(produto.preco) || 0;
  const o = ops.find((x) => x.rotulo === rotulo) || ops[0];
  return Number(o.valor) || 0;
};

// Menor valor entre as opções (para "a partir de").
window.menorPreco = function (produto) {
  const ops = window.opcoesDePreco(produto);
  return ops ? Math.min(...ops.map((o) => Number(o.valor))) : Number(produto.preco) || 0;
};

// Botões "Par R$ 60,00 | Unidade R$ 45,00 | Trio R$ 85,00" (um grupo de rádio).
window.htmlOpcoesPreco = function (produto, nomeGrupo, selecionado) {
  const ops = window.opcoesDePreco(produto);
  if (!ops) return "";
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const marcado = ops.some((o) => o.rotulo === selecionado) ? selecionado : ops[0].rotulo;
  return `<div class="preco-opcoes" role="radiogroup" aria-label="Como deseja comprar">${ops.map((o) => `
    <label class="preco-opcao">
      <input type="radio" name="${esc(nomeGrupo)}" value="${esc(o.rotulo)}"${o.rotulo === marcado ? " checked" : ""}>
      <span><b>${esc(o.rotulo)}</b><em>${moeda(o.valor)}</em></span>
    </label>`).join("")}</div>`;
};
