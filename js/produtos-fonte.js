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
