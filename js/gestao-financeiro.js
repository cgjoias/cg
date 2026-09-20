// ============================================================
// ABA "FINANCEIRO" DA GESTÃO
// Controle de estoque em valor, preço de venda e vendas.
// - Os números de estoque/vendas vêm da planilha de Controle de Estoque
//   (a mesma que você envia em Produtos > Importar planilha).
// - Custo e preço de venda você define aqui e ficam salvos.
// Tabelas PRIVADAS no Supabase (schema-financeiro.sql): só quem está logado lê.
// ============================================================
(function () {
  // Valores de venda por tipo (iguais aos do catálogo do site) e quantas peças (alianças) cada tipo leva.
  const TIPOS = [
    { id: "par", rotulo: "Par", por: 2 },
    { id: "unidade", rotulo: "Unidade", por: 1 },
    { id: "trio", rotulo: "Trio", por: 3 },
  ];
  const PADRAO = { markup: 3, custo_padrao: null, arredondar: false, descontar_frete: false, tabela: { par: 60, unidade: 45, trio: 85 } };
  const LOCAL_KEY = "cg_fin_criterios";
  const juntaCfg = (v) => ({ ...PADRAO, ...(v || {}), tabela: { ...PADRAO.tabela, ...((v && v.tabela) || {}) } });
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch (e) { return null; } };
  const guardarLocal = (valor, ts) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ valor, ts })); } catch (e) { /* sem armazenamento local */ } };
  const MSG_SEM_TABELA = "As tabelas do financeiro ainda não existem no Supabase. Abra o arquivo schema-financeiro.sql, copie tudo e rode em SQL Editor > New query > Run. Depois recarregue esta página.";

  let cfg = juntaCfg();
  let modelos = [];
  let vendas = [];
  let produtosSite = [];
  let semTabela = false;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const inteiro = (v) => Number(v || 0).toLocaleString("pt-BR");
  const baseDe = (m) => String(m).replace(/\.\d+$/, "");
  const campoNum = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
  const ehTabelaAusente = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|Could not find the table/i.test(e.message || ""));

  function lerNumero(v) {
    if (typeof v === "number") return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    let t = String(v ?? "").replace(/R\$|\s/g, "");
    if (!t) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const n = Number(t);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function aviso(texto, tipo, idEl) {
    const el = $(idEl || "fin-msg");
    if (!el) return;
    el.textContent = texto;
    el.className = "prod-msg " + (tipo === "erro" ? "erro" : "ok");
    el.hidden = false;
    clearTimeout(aviso.t);
    if (tipo !== "erro" && !idEl) aviso.t = setTimeout(() => (el.hidden = true), 6000);
  }

  // ============================================================
  // 1) LEITURA DA PLANILHA (abas ESTOQUE, ENTRADAS e SAIDA)
  // ============================================================
  function achaAba(wb, nome) {
    const n = wb.SheetNames.find((s) => norm(s) === nome);
    return n ? wb.Sheets[n] : null;
  }

  function tabela(X, wb, aba, colunaObrigatoria) {
    const ws = achaAba(wb, aba);
    if (!ws) return null;
    const aoa = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    const i = aoa.findIndex((r) => r.some((c) => norm(c) === colunaObrigatoria));
    if (i < 0) return null;
    const cab = aoa[i].map(norm);
    return { linhas: aoa.slice(i + 1), col: (nome) => cab.findIndex((h) => h === nome) };
  }

  function paraData(v) {
    if (typeof v === "number" && v > 20000 && v < 80000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
    }
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(v ?? "").trim());
    if (m) {
      const ano = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    return null;
  }

  // catalogo (opcional): [{ codigo, nome }] só pra dar nome legível aos modelos.
  function lerPlanilha(X, wb, catalogo) {
    const est = tabela(X, wb, "estoque", "modelo");
    if (!est) return null;
    const iM = est.col("modelo"), iT = est.col("total"), iS = est.col("situacao");

    const nomeDoCatalogo = (modelo) => {
      const lista = catalogo || [];
      const p = lista.find((x) => x.codigo === modelo) || lista.find((x) => baseDe(x.codigo) === modelo);
      return p && p.nome ? p.nome : null;
    };

    const mods = new Map();
    est.linhas.forEach((r) => {
      const modelo = String(r[iM] ?? "").trim();
      if (!modelo || mods.has(modelo)) return;
      const total = Number(r[iT]);
      mods.set(modelo, {
        modelo,
        nome: nomeDoCatalogo(modelo),
        estoque: isFinite(total) ? Math.round(total) : 0,
        comprado: 0,
        vendido: 0,
        situacao: iS >= 0 ? String(r[iS] ?? "").trim() || null : null,
      });
    });
    if (!mods.size) return null;
    const achar = (m) => mods.get(m) || mods.get(baseDe(m)) || null;
    let semModelo = 0;

    const ent = tabela(X, wb, "entradas", "modelo");
    let linhasEntrada = 0;
    if (ent) {
      const iEM = ent.col("modelo"), iEQ = ent.col("quantidade");
      ent.linhas.forEach((r) => {
        const modelo = String(r[iEM] ?? "").trim();
        if (!modelo) return;
        linhasEntrada++;
        const q = Number(r[iEQ]) || 0;
        const alvo = achar(modelo);
        alvo ? (alvo.comprado += q) : semModelo++;
      });
    }

    const listaVendas = [];
    const sai = tabela(X, wb, "saida", "modelo");
    if (sai) {
      const c = (n) => sai.col(n);
      const iD = c("data"), iM2 = c("modelo"), iN = c("numeracao"), iQ = c("quantidade"), iC = c("cliente"), iV = c("pr venda"), iF = c("pr frete"), iO = c("observacao");
      sai.linhas.forEach((r) => {
        const modelo = String(r[iM2] ?? "").trim();
        if (!modelo) return;
        const qtd = Math.max(1, Math.round(Number(r[iQ]) || 1));
        const vCru = iV >= 0 ? r[iV] : "";
        const fCru = iF >= 0 ? r[iF] : "";
        const brinde = /brinde/i.test(String(vCru));
        const alvo = achar(modelo);
        alvo ? (alvo.vendido += qtd) : semModelo++;
        listaVendas.push({
          data: iD >= 0 ? paraData(r[iD]) : null,
          modelo,
          numeracao: iN >= 0 ? String(r[iN] ?? "").trim() || null : null,
          qtd,
          cliente: iC >= 0 ? String(r[iC] ?? "").trim() || null : null,
          valor: brinde ? null : (typeof vCru === "number" ? vCru : lerNumero(vCru)),
          brinde,
          frete: typeof fCru === "number" ? fCru : lerNumero(fCru),
          retirada: /retirada/i.test(String(fCru)),
          obs: iO >= 0 ? String(r[iO] ?? "").trim() || null : null,
        });
      });
    }

    const lista = [...mods.values()];
    return {
      modelos: lista,
      vendas: listaVendas,
      resumo: {
        modelos: lista.length,
        pecas: lista.reduce((a, m) => a + m.estoque, 0),
        vendas: listaVendas.length,
        entradas: linhasEntrada,
        semModelo,
      },
    };
  }

  // ============================================================
  // 2) GRAVAÇÃO (espelha a planilha: o que saiu dela sai daqui)
  // ============================================================
  async function upsertEmLotes(tabelaNome, linhas, chave) {
    for (let i = 0; i < linhas.length; i += 100) {
      const { error } = await db.from(tabelaNome).upsert(linhas.slice(i, i + 100), { onConflict: chave });
      if (error) throw error;
    }
  }

  async function aplicar(dados) {
    try {
      const agora = new Date().toISOString();
      // Modelos: atualiza só o que a planilha sabe (custo e preço de venda ficam intactos).
      await upsertEmLotes("financeiro_modelos", dados.modelos.map((m) => ({ ...m, updated_at: agora })), "modelo");
      const { data: existentes, error: e1 } = await db.from("financeiro_modelos").select("modelo");
      if (e1) throw e1;
      const naPlanilha = new Set(dados.modelos.map((m) => m.modelo));
      const sobrando = (existentes || []).map((x) => x.modelo).filter((m) => !naPlanilha.has(m));
      for (let i = 0; i < sobrando.length; i += 100) {
        const { error } = await db.from("financeiro_modelos").delete().in("modelo", sobrando.slice(i, i + 100));
        if (error) throw error;
      }
      // Vendas: regrava numeradas 1..N e apaga as que passaram de N.
      const vs = dados.vendas.map((v, i) => ({ id: i + 1, ...v, updated_at: agora }));
      await upsertEmLotes("financeiro_vendas", vs, "id");
      const { error: e2 } = await db.from("financeiro_vendas").delete().gt("id", vs.length);
      if (e2) throw e2;
      return { ok: true, modelos: dados.modelos.length, vendas: vs.length, removidos: sobrando.length };
    } catch (erro) {
      return { ok: false, erro: ehTabelaAusente(erro) ? MSG_SEM_TABELA : (erro.message || String(erro)) };
    }
  }

  // ============================================================
  // 3) CÁLCULOS (custo e preço "efetivos" seguem os critérios salvos)
  // ============================================================
  function arredonda(v) {
    if (cfg.arredondar) return Math.max(0.9, Math.round(v - 0.9) + 0.9);
    return Math.round(v * 100) / 100;
  }

  function custoEf(m) {
    const proprio = m.custo != null ? Number(m.custo) : null;
    if (proprio != null && isFinite(proprio)) return proprio;
    const padrao = cfg.custo_padrao != null ? Number(cfg.custo_padrao) : null;
    return padrao != null && isFinite(padrao) ? padrao : null;
  }

  function vendaEf(m) {
    if (m.preco_venda != null && Number(m.preco_venda) > 0) return Number(m.preco_venda);
    const c = custoEf(m);
    const mult = Number(cfg.markup);
    return c > 0 && mult > 0 ? arredonda(c * mult) : null;
  }

  function acharModelo(codigo) {
    return modelos.find((m) => m.modelo === codigo) || modelos.find((m) => m.modelo === baseDe(codigo)) || null;
  }

  function tokensDoCodigo(codigo) {
    return String(codigo || "").split(/[|,;]/).map((t) => t.trim()).filter(Boolean);
  }

  function produtoDoSite(modelo) {
    return produtosSite.find((p) => tokensDoCodigo(p.codigo).includes(modelo))
      || produtosSite.find((p) => tokensDoCodigo(p.codigo).some((t) => baseDe(t) === baseDe(modelo))) || null;
  }

  const nomeDoModelo = (m) => m.nome || (produtoDoSite(m.modelo) || {}).nome || "";

  function totaisEstoque() {
    let valorCusto = 0, valorVenda = 0, lucro = 0, semDados = 0, pecas = 0;
    modelos.forEach((m) => {
      pecas += m.estoque;
      if (m.estoque <= 0) return;
      const c = custoEf(m), v = vendaEf(m);
      if (c != null) valorCusto += m.estoque * c;
      if (v != null) valorVenda += m.estoque * v;
      if (c != null && v != null) lucro += m.estoque * (v - c);
      if (c == null || v == null) semDados++;
    });
    return { valorCusto, valorVenda, lucro, semDados, pecas };
  }

  // Valor de uma peça (modelo) por tipo de venda. Usa os valores Par/Unidade/Trio do produto no
  // site quando existem; senão a tabela padrão dos critérios. Peça com preço único no site
  // (anel, brinde etc.) entra à parte, como "preço único".
  function tabelaDoModelo(m) {
    const p = produtoDoSite(m.modelo);
    const t = { ...cfg.tabela };
    if (p && Array.isArray(p.precos) && p.precos.length) {
      p.precos.forEach((x) => { const k = norm(x.rotulo); if (k in t && Number(x.valor) > 0) t[k] = Number(x.valor); });
      return { tipo: true, t };
    }
    if (p) {
      const unico = m.preco_venda != null && Number(m.preco_venda) > 0 ? Number(m.preco_venda) : Number(p.preco) > 0 ? Number(p.preco) : null;
      if (unico != null) return { tipo: false, unico };
    }
    return { tipo: true, t };
  }

  function somaTipos(itens) {
    const r = { par: 0, unidade: 0, trio: 0, outros: 0, pecas: 0, pecasOutros: 0 };
    itens.forEach(({ m, qtd }) => {
      if (!m || qtd <= 0) return;
      const x = tabelaDoModelo(m);
      if (x.tipo) {
        r.pecas += qtd;
        TIPOS.forEach((tp) => { r[tp.id] += (qtd / tp.por) * x.t[tp.id]; });
      } else {
        r.pecasOutros += qtd;
        r.outros += qtd * x.unico;
      }
    });
    r.soma = r.par + r.unidade + r.trio + r.outros;
    return r;
  }

  const qtdFmt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  // ---------- painéis de valor por tipo (Par / Unidade / Trio) ----------
  const barra = (pct) => `<div class="fin-hbar"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;

  function painelTipo(titulo, sub, r, extra) {
    const t = cfg.tabela;
    const max = Math.max(r.par, r.unidade, r.trio, r.outros || 0, 1);
    const linhas = TIPOS.map((tp) => {
      const dica = tp.por === 1
        ? `${qtdFmt(r.pecas)} peça(s) × ${moeda(t[tp.id])}`
        : `${qtdFmt(r.pecas / tp.por)} ${tp.id === "par" ? "par(es)" : "trio(s)"} × ${moeda(t[tp.id])} · ${qtdFmt(r.pecas)} peças`;
      return `<li><div class="fin-tipo-topo"><span class="fin-tipo-nome">${tp.rotulo}<em>${moeda(t[tp.id])}</em></span><strong>${moeda(r[tp.id])}</strong></div>${barra((r[tp.id] / max) * 100)}<small>${esc(dica)}</small></li>`;
    });
    if (r.pecasOutros) linhas.push(`<li><div class="fin-tipo-topo"><span class="fin-tipo-nome">Preço único<em>definido no site</em></span><strong>${moeda(r.outros)}</strong></div>${barra((r.outros / max) * 100)}<small>${qtdFmt(r.pecasOutros)} peça(s) com preço próprio</small></li>`);
    return `<article class="fin-painel fin-painel-tipo">
      <header class="fin-painel-cab"><h3>${esc(titulo)}</h3><span class="fin-painel-sub">${esc(sub)}</span></header>
      <div class="fin-total"><span>Valor total — soma de tudo</span><strong>${moeda(r.soma)}</strong><small>${r.pecasOutros ? "Par + Unidade + Trio + preço único" : "Par + Unidade + Trio somados"}</small></div>
      <ul class="fin-tipos-lista">${linhas.join("")}</ul>${extra || ""}
    </article>`;
  }

  function desenharTipos() {
    const alvo = $("fin-tipos");
    if (!alvo) return;
    const est = somaTipos(modelos.map((m) => ({ m, qtd: m.estoque })));
    const ven = somaTipos(vendas.filter((v) => !v.brinde).map((v) => ({ m: acharModelo(v.modelo), qtd: v.qtd })));
    const recebido = totaisVendas().receita;
    alvo.innerHTML = `<div class="fin-duo">
      ${painelTipo("Em estoque", `${qtdFmt(est.pecas + est.pecasOutros)} peças paradas`, est)}
      ${painelTipo("Peças vendidas", `${qtdFmt(ven.pecas + ven.pecasOutros)} peças`, ven, `<div class="fin-recebido"><span>Recebido de fato (planilha)</span><strong>${moeda(recebido)}</strong></div>`)}
    </div>
    <p class="fin-nota">Cada valor é o total se todas as peças fossem vendidas naquele tipo: Par = 2 peças por par, Unidade = 1 peça, Trio = 3 peças por trio. Os valores vêm do catálogo do site (Par, Unidade, Trio); onde a peça não tem, valem os da seção Critérios.</p>`;
  }

  function totaisVendas() {
    const t = { receita: 0, custo: 0, frete: 0, pecas: 0, brindes: 0, semCusto: 0 };
    vendas.forEach((v) => {
      t.pecas += v.qtd;
      if (v.brinde) t.brindes += v.qtd;
      if (v.valor != null) t.receita += Number(v.valor);
      if (v.frete != null) t.frete += Number(v.frete);
      const m = acharModelo(v.modelo);
      const c = m ? custoEf(m) : null;
      c != null ? (t.custo += c * v.qtd) : t.semCusto++;
    });
    t.lucro = t.receita - t.custo - (cfg.descontar_frete ? t.frete : 0);
    return t;
  }

  // ============================================================
  // 4) TELA
  // ============================================================
  const ICONES = {
    estoque: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
    receita: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M9.5 9.6c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.7c0 2.2-5 1.1-5 3.4 0 1.1 1 1.7 2.5 1.7s2.5-.6 2.5-1.6"/>',
    vendas: '<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8a3 3 0 016 0"/>',
    lucro: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  };
  const PALETA = ["#c2557a", "#d4a017", "#7a2142", "#e9a6bd", "#5b8a72", "#8a6fb0", "#e07a9a", "#4f7cac"];
  const moedaCurta = (v) => {
    v = Number(v || 0);
    return v >= 1000 ? "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : "R$ " + v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  };

  const kpi = (icone, rotulo, valor, dica, cor) =>
    `<article class="fin-kpi" style="--kpi:${cor}"><span class="fin-kpi-icone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[icone]}</svg></span>
      <div class="fin-kpi-txt"><span class="fin-rotulo">${esc(rotulo)}</span><strong class="fin-valor">${esc(valor)}</strong>${dica ? `<span class="fin-dica">${esc(dica)}</span>` : ""}</div></article>`;

  const mini = (rotulo, valor, dica) =>
    `<div class="fin-mini"><span class="fin-rotulo">${esc(rotulo)}</span><strong>${esc(valor)}</strong>${dica ? `<span class="fin-dica">${esc(dica)}</span>` : ""}</div>`;

  function desenharResumo() {
    const e = totaisEstoque(), v = totaisVendas();
    const alvo = $("fin-resumo");
    if (!alvo) return;
    alvo.innerHTML = [
      kpi("estoque", "Peças em estoque", inteiro(e.pecas), `${inteiro(modelos.length)} modelos`, PALETA[0]),
      kpi("receita", "Recebido em vendas", moeda(v.receita), "soma do PR VENDA da planilha", PALETA[1]),
      kpi("vendas", "Peças vendidas", inteiro(v.pecas - v.brindes), `${inteiro(v.brindes)} brinde(s) entregue(s)`, PALETA[4]),
      kpi("lucro", "Lucro das vendas", v.custo === 0 && v.semCusto ? "—" : moeda(v.lucro), v.custo === 0 && v.semCusto ? "defina o custo em Critérios ou por modelo" : v.semCusto ? `${v.semCusto} saída(s) sem custo definido` : cfg.descontar_frete ? "já descontado o frete" : "sem descontar o frete", PALETA[2]),
    ].join("");
    const det = $("fin-detalhes");
    if (det) det.innerHTML = [
      mini("Valor do estoque (custo)", moeda(e.valorCusto), "quanto você investiu no que está parado"),
      mini("Valor do estoque (venda)", moeda(e.valorVenda), e.semDados ? `${e.semDados} modelo(s) sem custo ou preço ficam fora` : "se vender tudo pelo preço de venda"),
      mini("Lucro potencial do estoque", moeda(e.lucro), "venda − custo, só de quem tem os dois"),
      mini("Custo das peças vendidas", moeda(v.custo), v.semCusto ? `${v.semCusto} saída(s) sem custo não entram` : "custo × quantidade"),
      mini("Frete informado", moeda(v.frete), "soma da coluna PR FRETE"),
    ].join("");
  }

  // ---------- gráficos ----------
  const vazio = (t) => `<p class="fin-vazio">${esc(t)}</p>`;

  function vendasPorMes() {
    const meses = new Map();
    vendas.forEach((v) => {
      if (!v.data) return;
      const k = v.data.slice(0, 7);
      const o = meses.get(k) || { pecas: 0, brindes: 0, receita: 0 };
      if (v.brinde) o.brindes += v.qtd; else o.pecas += v.qtd;
      if (v.valor != null) o.receita += Number(v.valor);
      meses.set(k, o);
    });
    return [...meses.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12);
  }

  function graficoMeses() {
    const dados = vendasPorMes();
    if (!dados.length) return vazio("Ainda não há vendas com data na planilha.");
    const max = Math.max(...dados.map(([, o]) => o.receita), 1);
    return `<div class="fin-colunas" role="img" aria-label="Recebido por mês">${dados.map(([k, o]) => {
      const h = o.receita > 0 ? Math.max(4, (o.receita / max) * 100) : 0;
      return `<div class="fin-col"><span class="fin-col-val">${moedaCurta(o.receita)}</span><div class="fin-col-area"><div class="fin-col-barra" style="height:${h.toFixed(1)}%"></div></div><span class="fin-col-rot">${k.slice(5)}/${k.slice(2, 4)}</span><span class="fin-col-sub">${inteiro(o.pecas)} peça(s)</span></div>`;
    }).join("")}</div>`;
  }

  function graficoSituacao() {
    const g = new Map();
    modelos.forEach((m) => {
      const k = (m.situacao || "Sem situação").toUpperCase();
      const o = g.get(k) || { modelos: 0, pecas: 0 };
      o.modelos += 1; o.pecas += m.estoque;
      g.set(k, o);
    });
    const itens = [...g.entries()].map(([rot, o]) => ({ rot, ...o })).sort((a, b) => b.pecas - a.pecas);
    const total = itens.reduce((a, i) => a + i.pecas, 0);
    if (!itens.length || !total) return vazio("Ainda não há estoque importado.");
    let acc = 0;
    const arcos = itens.map((it, i) => {
      const p = (it.pecas / total) * 100;
      const c = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${PALETA[i % PALETA.length]}" stroke-width="6" stroke-dasharray="${p.toFixed(3)} ${(100 - p).toFixed(3)}" stroke-dashoffset="${(25 - acc).toFixed(3)}"/>`;
      acc += p;
      return c;
    }).join("");
    const legenda = itens.map((it, i) => `<li><i style="background:${PALETA[i % PALETA.length]}"></i><span class="fin-leg-nome">${esc(it.rot)}</span><span class="fin-leg-val">${inteiro(it.pecas)} <em>${inteiro(it.modelos)} mod.</em></span></li>`).join("");
    return `<div class="fin-donut-wrap"><div class="fin-donut"><svg viewBox="0 0 42 42" role="img" aria-label="Estoque por situação"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--fin-trilho)" stroke-width="6"/>${arcos}</svg><div class="fin-donut-centro"><strong>${inteiro(total)}</strong><span>peças</span></div></div><ul class="fin-legenda">${legenda}</ul></div>`;
  }

  function ranking(itens, sufixo) {
    if (!itens.length) return vazio("Sem dados ainda.");
    const max = Math.max(...itens.map((i) => i.valor), 1);
    return `<ol class="fin-rank">${itens.map((it, i) => `<li><span class="fin-rank-n">${i + 1}</span><div class="fin-rank-corpo"><div class="fin-rank-top"><span class="fin-rank-nome"><b>${esc(it.rot)}</b>${it.sub ? ` <span>${esc(it.sub)}</span>` : ""}</span><strong>${inteiro(it.valor)}${sufixo}</strong></div>${barra((it.valor / max) * 100)}</div></li>`).join("")}</ol>`;
  }

  function graficoEstoque() {
    return ranking(modelos.filter((m) => m.estoque > 0).sort((a, b) => b.estoque - a.estoque).slice(0, 8).map((m) => ({ rot: m.modelo, sub: nomeDoModelo(m), valor: m.estoque })), " un.");
  }

  function graficoMaisVendidos() {
    const g = new Map();
    vendas.filter((v) => !v.brinde).forEach((v) => g.set(v.modelo, (g.get(v.modelo) || 0) + v.qtd));
    return ranking([...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([modelo, q]) => { const m = acharModelo(modelo); return { rot: modelo, sub: m ? nomeDoModelo(m) : "", valor: q }; }), " un.");
  }

  const painel = (cls, titulo, sub, corpo) =>
    `<article class="fin-painel ${cls}"><header class="fin-painel-cab"><h3>${esc(titulo)}</h3>${sub ? `<span class="fin-painel-sub">${esc(sub)}</span>` : ""}</header>${corpo}</article>`;

  function desenharGraficos() {
    const alvo = $("fin-graficos");
    if (!alvo) return;
    alvo.innerHTML = [
      painel("fin-c7", "Recebido por mês", "últimos 12 meses com venda", graficoMeses()),
      painel("fin-c5", "Estoque por situação", "peças em cada situação", graficoSituacao()),
      painel("fin-c6", "Maiores estoques", "8 modelos com mais peças", graficoEstoque()),
      painel("fin-c6", "Mais vendidos", "8 modelos por peças vendidas", graficoMaisVendidos()),
    ].join("");
  }

  function celulasCalculadas(m) {
    const c = custoEf(m), v = vendaEf(m);
    return {
      venda: v != null ? moeda(v) : "—",
      margem: c != null && v ? Math.round(((v - c) / v) * 100) + "%" : "—",
      valor: v != null ? moeda(m.estoque * v) : "—",
    };
  }

  function selo(txt) {
    if (!txt) return "—";
    const n = norm(txt);
    const cls = n.includes("sem") || n.includes("zerad") ? "fin-selo-zero" : n.includes("baixo") ? "fin-selo-baixo" : "fin-selo-bom";
    return `<span class="fin-selo ${cls}">${esc(txt)}</span>`;
  }

  function linhaModelo(m) {
    const c = celulasCalculadas(m);
    const nome = nomeDoModelo(m);
    const cls = m.estoque <= 0 ? "fin-zero" : "";
    const auto = vendaEf({ ...m, preco_venda: null });
    return `<tr data-m="${esc(m.modelo)}" class="${cls}">
      <td class="fin-full" data-label="Modelo"><strong>${esc(m.modelo)}</strong></td>
      <td class="fin-nome fin-full" data-label="Peça">${esc(nome) || "—"}</td>
      <td class="fin-num" data-label="Em estoque">${inteiro(m.estoque)}</td>
      <td class="fin-num" data-label="Comprado">${inteiro(m.comprado)}</td>
      <td class="fin-num" data-label="Saídas">${inteiro(m.vendido)}</td>
      <td data-label="Situação">${selo(m.situacao)}</td>
      <td data-label="Custo (R$)"><input class="fin-in" data-campo="custo" data-m="${esc(m.modelo)}" inputmode="decimal" value="${campoNum(m.custo)}" placeholder="${cfg.custo_padrao != null ? campoNum(cfg.custo_padrao) : "0,00"}" aria-label="Custo de ${esc(m.modelo)}"></td>
      <td data-label="Preço de venda (R$)"><input class="fin-in" data-campo="preco_venda" data-m="${esc(m.modelo)}" inputmode="decimal" value="${campoNum(m.preco_venda)}" placeholder="${auto != null ? campoNum(auto) : "auto"}" aria-label="Preço de venda de ${esc(m.modelo)}"></td>
      <td class="fin-num" data-cel="venda" data-label="Venda final">${esc(c.venda)}</td>
      <td class="fin-num" data-cel="margem" data-label="Margem">${esc(c.margem)}</td>
      <td class="fin-num" data-cel="valor" data-label="Valor em estoque">${esc(c.valor)}</td>
    </tr>`;
  }

  function desenharModelos() {
    const termo = norm(($("fin-busca") || {}).value);
    const lista = modelos.filter((m) => !termo || norm(m.modelo).includes(termo) || norm(nomeDoModelo(m)).includes(termo));
    $("fin-modelos").innerHTML = lista.length
      ? `<table class="fin-tabela fin-responsiva"><thead><tr>
          <th>Modelo</th><th>Peça</th><th>Em estoque</th><th>Comprado</th><th>Saídas</th><th>Situação</th>
          <th>Custo (R$)</th><th>Preço de venda (R$)</th><th>Venda final</th><th>Margem</th><th>Valor em estoque</th>
        </tr></thead><tbody>${lista.map(linhaModelo).join("")}</tbody></table>`
      : `<p class="fin-vazio">${modelos.length ? "Nenhum modelo encontrado." : "Ainda não há dados. Vá em Produtos > Importar planilha e envie a planilha de Controle de Estoque: ela alimenta esta aba."}</p>`;
  }

  const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "—");

  function desenharVendas() {
    const alvo = $("fin-vendas");
    if (!alvo) return;
    if (!vendas.length) { alvo.innerHTML = `<p class="fin-vazio">Nenhuma venda registrada na aba SAIDA da planilha.</p>`; return; }
    const meses = new Map();
    vendas.forEach((v) => {
      const k = v.data ? v.data.slice(0, 7) : "sem data";
      const o = meses.get(k) || { pecas: 0, brindes: 0, receita: 0 };
      o.pecas += v.qtd;
      if (v.brinde) o.brindes += v.qtd;
      if (v.valor != null) o.receita += Number(v.valor);
      meses.set(k, o);
    });
    const nomeMes = (k) => (k === "sem data" ? k : `${k.slice(5)}/${k.slice(0, 4)}`);
    const porMes = [...meses.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([k, o]) =>
      `<tr><td data-label="Mês">${esc(nomeMes(k))}</td><td class="fin-num" data-label="Peças vendidas">${inteiro(o.pecas - o.brindes)}</td><td class="fin-num" data-label="Brindes">${inteiro(o.brindes)}</td><td class="fin-num" data-label="Total vendido">${moeda(o.receita)}</td></tr>`).join("");
    const linhas = [...vendas].sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b.id - a.id).map((v) => {
      const m = acharModelo(v.modelo);
      const c = m ? custoEf(m) : null;
      const custo = c != null ? c * v.qtd : null;
      const lucro = custo != null ? (v.valor != null ? Number(v.valor) : 0) - custo : null;
      return `<tr>
        <td data-label="Data">${esc(dataBR(v.data))}</td><td data-label="Modelo"><strong>${esc(v.modelo)}</strong></td><td data-label="Nº">${esc(v.numeracao || "—")}</td><td class="fin-num" data-label="Qtd">${inteiro(v.qtd)}</td>
        <td class="fin-full" data-label="Cliente">${esc(v.cliente || "—")}</td>
        <td class="fin-num" data-label="Valor">${v.brinde ? "BRINDE" : v.valor != null ? moeda(v.valor) : "—"}</td>
        <td class="fin-num" data-label="Frete">${v.retirada ? "Retirada" : v.frete != null ? moeda(v.frete) : "—"}</td>
        <td class="fin-num" data-label="Custo">${custo != null ? moeda(custo) : "—"}</td>
        <td class="fin-num" data-label="Lucro da linha">${lucro != null ? moeda(lucro) : "—"}</td>
      </tr>`;
    }).join("");
    alvo.innerHTML = `
      <h3 class="fin-sub-titulo">Por mês</h3>
      <div class="fin-rolagem"><table class="fin-tabela fin-tabela-pequena fin-responsiva"><thead><tr><th>Mês</th><th>Peças vendidas</th><th>Brindes</th><th>Total vendido</th></tr></thead><tbody>${porMes}</tbody></table></div>
      <h3 class="fin-sub-titulo">Saídas, da mais recente para a mais antiga</h3>
      <div class="fin-rolagem"><table class="fin-tabela fin-responsiva"><thead><tr><th>Data</th><th>Modelo</th><th>Nº</th><th>Qtd</th><th>Cliente</th><th>Valor</th><th>Frete</th><th>Custo</th><th>Lucro da linha</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function desenharCriterios() {
    $("fin-criterios").innerHTML = `
      <div class="fin-grupos">
        <div class="fin-grupo">
          <h4>Valores por tipo de venda</h4>
          <div class="fin-form">
            <div class="field"><label for="fin-preco-par">Valor do Par (R$)</label>
              <input type="text" id="fin-preco-par" inputmode="decimal" value="${campoNum(cfg.tabela.par)}" placeholder="60,00"></div>
            <div class="field"><label for="fin-preco-unidade">Valor da Unidade (R$)</label>
              <input type="text" id="fin-preco-unidade" inputmode="decimal" value="${campoNum(cfg.tabela.unidade)}" placeholder="45,00"></div>
            <div class="field"><label for="fin-preco-trio">Valor do Trio (R$)</label>
              <input type="text" id="fin-preco-trio" inputmode="decimal" value="${campoNum(cfg.tabela.trio)}" placeholder="85,00"></div>
          </div>
          <p class="field-hint">Usados nos totais em jóias quando a peça não tem esses valores no catálogo do site.</p>
        </div>
        <div class="fin-grupo">
          <h4>Custo e preço de venda</h4>
          <div class="fin-form">
            <div class="field"><label for="fin-custo-padrao">Custo padrão por peça (R$)</label>
              <input type="text" id="fin-custo-padrao" inputmode="decimal" value="${campoNum(cfg.custo_padrao)}" placeholder="ex.: 20,00">
              <span class="field-hint">Vale nos modelos sem custo próprio.</span></div>
            <div class="field"><label for="fin-markup">Multiplicador sobre o custo (×)</label>
              <input type="text" id="fin-markup" inputmode="decimal" value="${campoNum(cfg.markup)}" placeholder="ex.: 3">
              <span class="field-hint" id="fin-exemplo"></span></div>
          </div>
          <label class="prod-check"><input type="checkbox" id="fin-arredondar" ${cfg.arredondar ? "checked" : ""}> Arredondar o preço calculado para terminar em ,90</label>
          <label class="prod-check"><input type="checkbox" id="fin-frete" ${cfg.descontar_frete ? "checked" : ""}> Descontar o frete do lucro das vendas (marque se a loja paga o frete)</label>
        </div>
      </div>
      <p class="field-hint">Cada modelo pode ter custo e preço de venda próprios na tabela de Controle de estoque; o que estiver preenchido lá vale mais que estes critérios. Preço de venda em branco = custo × multiplicador.</p>
      <div class="prod-botoes"><button type="button" class="btn btn-primary" id="fin-salvar-criterios">Salvar critérios</button></div>`;
    atualizarExemplo();
  }

  function atualizarExemplo() {
    const el = $("fin-exemplo");
    if (!el) return;
    const mult = lerNumero($("fin-markup").value);
    const guardado = cfg;
    cfg = { ...cfg, markup: mult, arredondar: $("fin-arredondar").checked };
    const ex = 20;
    el.textContent = mult > 0 ? `Compra por ${moeda(ex)} → vende por ${moeda(arredonda(ex * mult))}` : "Informe um multiplicador, por exemplo 3 (compra por 20, vende por 60).";
    cfg = guardado;
  }

  async function salvarCriterios(botao) {
    const erroCampo = (t) => aviso(t, "erro", "fin-msg-criterios");
    const custo = String($("fin-custo-padrao").value).trim() === "" ? null : lerNumero($("fin-custo-padrao").value);
    const mult = lerNumero($("fin-markup").value);
    if ($("fin-custo-padrao").value.trim() !== "" && custo === null) return erroCampo("Custo padrão inválido. Use números, por exemplo 20,00.");
    if (!(mult > 0)) return erroCampo("Informe um multiplicador maior que zero, por exemplo 3.");
    const tabela = {};
    for (const tp of TIPOS) {
      const v = lerNumero($("fin-preco-" + tp.id).value);
      if (!(v > 0)) return erroCampo(`Informe o valor do ${tp.rotulo} maior que zero, por exemplo ${campoNum(PADRAO.tabela[tp.id])}.`);
      tabela[tp.id] = v;
    }
    const novo = { markup: mult, custo_padrao: custo, arredondar: $("fin-arredondar").checked, descontar_frete: $("fin-frete").checked, tabela };
    botao.disabled = true;
    const ts = new Date().toISOString();
    let falha = null;
    try {
      // .select() faz o banco devolver a linha gravada; sem isso, uma permissão faltando (RLS)
      // grava zero linhas e não dá erro nenhum — parecia que salvava, mas não salvava.
      const { data, error } = await db.from("financeiro_config").upsert({ chave: "criterios", valor: novo, updated_at: ts }, { onConflict: "chave" }).select();
      if (error) falha = ehTabelaAusente(error) ? MSG_SEM_TABELA : error.message;
      else if (!data || !data.length) falha = "o Supabase recusou a gravação (falta permissão nas tabelas do financeiro). Rode o arquivo schema-financeiro.sql em SQL Editor > New query > Run e tente de novo.";
    } catch (e) {
      falha = e.message || String(e);
    }
    botao.disabled = false;
    guardarLocal(novo, ts); // cópia neste navegador: os critérios não se perdem mesmo se o banco falhar
    cfg = juntaCfg(novo);
    desenharTudo();
    if (falha) {
      aviso("Critérios aplicados e guardados só neste navegador. Não foi possível gravar no Supabase: " + falha, "erro", "fin-msg-criterios");
      aviso("Critérios NÃO foram gravados no Supabase: " + falha, "erro");
    } else {
      aviso("Critérios salvos.", "ok", "fin-msg-criterios");
      aviso("Critérios salvos.");
    }
  }

  async function salvarCampo(input) {
    const modelo = input.dataset.m, campo = input.dataset.campo;
    const m = modelos.find((x) => x.modelo === modelo);
    if (!m) return;
    const bruto = input.value.trim();
    const valor = bruto === "" ? null : lerNumero(bruto);
    if (bruto !== "" && valor === null) {
      input.value = campoNum(m[campo]);
      return aviso("Valor inválido. Use números, por exemplo 59,90.", "erro");
    }
    if ((m[campo] ?? null) === valor) return;
    const { data, error } = await db.from("financeiro_modelos").update({ [campo]: valor, updated_at: new Date().toISOString() }).eq("modelo", modelo).select();
    if (error || !data || !data.length) {
      input.value = campoNum(m[campo]);
      return aviso("Não foi possível salvar: " + (error ? error.message : "sua sessão pode ter expirado. Saia e entre de novo."), "erro");
    }
    m[campo] = valor;
    input.value = campoNum(valor);
    // atualiza só os números calculados dessa linha (não perde o foco do campo vizinho)
    const tr = input.closest("tr");
    const c = celulasCalculadas(m);
    tr.querySelector('[data-cel="venda"]').textContent = c.venda;
    tr.querySelector('[data-cel="margem"]').textContent = c.margem;
    tr.querySelector('[data-cel="valor"]').textContent = c.valor;
    const pv = tr.querySelector('[data-campo="preco_venda"]');
    const auto = vendaEf({ ...m, preco_venda: null });
    pv.placeholder = auto != null ? campoNum(auto) : "auto";
    desenharResumo();
    desenharTipos();
    desenharVendas();
  }

  // ---------- levar os preços de venda para o site ----------
  function precosParaOSite() {
    const mudancas = [];
    produtosSite.forEach((p) => {
      // Peça com valores por tipo (Par / Unidade / Trio) tem o preço definido por eles; não mexe.
      if (Array.isArray(p.precos) && p.precos.length) return;
      const tokens = tokensDoCodigo(p.codigo);
      if (!tokens.length) return;
      let venda = null;
      for (const t of tokens) {
        const m = acharModelo(t);
        const v = m ? vendaEf(m) : null;
        if (v != null) { venda = v; break; }
      }
      if (venda != null && Number(p.preco) !== venda) mudancas.push({ p, de: Number(p.preco) || 0, para: venda });
    });
    return mudancas;
  }

  function abrirModalSimples(html) {
    $("prod-modal-corpo").innerHTML = html;
    $("prod-modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("prod-modal").scrollTop = 0;
  }

  function fecharModalSimples() {
    $("prod-modal").hidden = true;
    document.body.style.overflow = "";
  }

  function verPrecosParaOSite() {
    const mudancas = precosParaOSite();
    if (!mudancas.length) { aviso("Os preços do site já estão iguais aos preços de venda definidos aqui (ou ainda não há preço de venda definido)."); return; }
    const itens = mudancas.slice(0, 50).map((m) => `<li><strong>${esc(m.p.nome)}</strong> (${esc(m.p.codigo)}): ${moeda(m.de)} → <b>${moeda(m.para)}</b></li>`).join("")
      + (mudancas.length > 50 ? `<li>...e mais ${mudancas.length - 50} peça(s)</li>` : "");
    abrirModalSimples(`
      <h2>Aplicar preços no site</h2>
      <p>${mudancas.length} peça(s) do catálogo vão receber o preço de venda definido aqui. Isso só muda o preço; não confirma nem publica a peça (a confirmação continua na aba Produtos).</p>
      <ul class="imp-lista">${itens}</ul>
      <p id="fin-erro-modal" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="fin-aplicar-precos">Aplicar ${mudancas.length} preço(s)</button>
        <button type="button" class="btn btn-line" id="fin-cancelar-precos">Cancelar</button>
      </div>`);
    $("fin-cancelar-precos").addEventListener("click", fecharModalSimples);
    $("fin-aplicar-precos").addEventListener("click", async (ev) => {
      const botao = ev.currentTarget;
      botao.disabled = true;
      botao.textContent = "Aplicando...";
      let feitos = 0, erro = "";
      const agora = new Date().toISOString();
      for (let i = 0; i < mudancas.length && !erro; i += 10) {
        const lote = await Promise.all(mudancas.slice(i, i + 10).map((m) => db.from("produtos").update({ preco: m.para, updated_at: agora }).eq("id", m.p.id).select()));
        lote.forEach((r, k) => {
          if (r.error) erro = r.error.message;
          else if (r.data && r.data.length) { feitos++; mudancas[i + k].p.preco = mudancas[i + k].para; }
        });
      }
      if (erro || !feitos) {
        botao.disabled = false;
        botao.textContent = "Tentar de novo";
        $("fin-erro-modal").textContent = erro ? "Erro ao aplicar: " + erro : "Nada foi alterado — sua sessão pode ter expirado. Saia e entre de novo.";
        $("fin-erro-modal").hidden = false;
        return;
      }
      fecharModalSimples();
      aviso(`Pronto: ${feitos} preço(s) atualizado(s) no site.`);
    });
  }

  // ---------- seções em "drop" (abrem e fecham; o navegador lembra) ----------
  const DROPS = ["criterios", "estoque", "vendas"];
  const dropKey = (id) => "cg_fin_drop_" + id;

  function definirDrop(id, aberto) {
    const b = document.querySelector(`[data-drop="${id}"]`), corpo = $("fin-corpo-" + id);
    if (!b || !corpo) return;
    b.setAttribute("aria-expanded", aberto ? "true" : "false");
    b.classList.toggle("aberto", aberto);
    corpo.hidden = !aberto;
    try { localStorage.setItem(dropKey(id), aberto ? "1" : "0"); } catch (e) { /* sem armazenamento */ }
  }

  function alternarDrop(id) {
    const corpo = $("fin-corpo-" + id);
    if (corpo) definirDrop(id, corpo.hidden);
  }

  function irPara(id) {
    if (DROPS.includes(id)) definirDrop(id, true);
    const alvo = $("fin-sec-" + id);
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function atualizarResumosDrop() {
    const e = totaisEstoque(), v = totaisVendas();
    const txt = {
      criterios: `Par ${moeda(cfg.tabela.par)} · Unidade ${moeda(cfg.tabela.unidade)} · Trio ${moeda(cfg.tabela.trio)}`,
      estoque: modelos.length ? `${inteiro(modelos.length)} modelos · ${inteiro(e.pecas)} peças` : "sem dados",
      vendas: vendas.length ? `${inteiro(vendas.length)} saídas · ${moeda(v.receita)}` : "sem vendas",
    };
    DROPS.forEach((id) => { const el = $("fin-resumo-" + id); if (el) el.textContent = txt[id]; });
  }

  function atualizarCarimbo() {
    const el = $("fin-atualizado");
    if (!el) return;
    const datas = modelos.map((m) => m.updated_at).filter(Boolean).map((d) => new Date(d).getTime()).filter((n) => isFinite(n));
    if (!datas.length) { el.textContent = "Ainda não há planilha importada."; return; }
    const d = new Date(Math.max(...datas));
    el.textContent = `Planilha atualizada em ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — a cada envio, estoque, vendas e totais são recalculados.`;
  }

  // Baixa TODAS as peças (ignora a busca), em CSV com ";" que o Excel em português abre certinho.
  function baixarEstoque() {
    if (!modelos.length) return aviso("Ainda não há dados para baixar. Importe a planilha primeiro.", "erro");
    const num = (v) => (v == null || v === "" ? "" : String(Number(v)).replace(".", ","));
    const cel = (v) => { const t = String(v ?? ""); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const cab = ["Modelo", "Peça", "Em estoque", "Comprado", "Saídas", "Situação", "Custo (R$)", "Preço de venda (R$)", "Venda final (R$)", "Margem", "Valor em estoque (R$)"];
    const linhas = modelos.map((m) => {
      const c = custoEf(m), v = vendaEf(m);
      return [m.modelo, nomeDoModelo(m), m.estoque, m.comprado, m.vendido, m.situacao || "", num(m.custo), num(m.preco_venda), num(v), c != null && v ? Math.round(((v - c) / v) * 100) + "%" : "", v != null ? num(m.estoque * v) : ""].map(cel).join(";");
    });
    const csv = "\ufeff" + [cab.map(cel).join(";"), ...linhas].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `controle-de-estoque-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    aviso(`Baixadas ${modelos.length} peça(s).`);
  }

  // ---------- montagem ----------
  function desenharTudo() {
    atualizarCarimbo();
    desenharResumo();
    desenharTipos();
    desenharGraficos();
    desenharCriterios();
    desenharModelos();
    desenharVendas();
    atualizarResumosDrop();
  }

  const cabecalhoSec = (n, titulo, sub) =>
    `<div class="fin-sec-cab"><span class="fin-num-sec">${n}</span><div><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>`;

  const secaoDrop = (id, n, titulo, sub, corpo) =>
    `<section class="fin-sec fin-sec-drop" id="fin-sec-${id}">
      <h2 class="fin-h2-drop"><button type="button" class="fin-drop" data-drop="${id}" aria-expanded="false" aria-controls="fin-corpo-${id}">
        <span class="fin-num-sec">${n}</span>
        <span class="fin-drop-txt"><span class="fin-drop-titulo">${esc(titulo)}</span><span class="fin-drop-sub">${esc(sub)}</span></span>
        <span class="fin-drop-resumo" id="fin-resumo-${id}"></span>
        <span class="fin-seta" aria-hidden="true">▾</span></button></h2>
      <div class="fin-corpo" id="fin-corpo-${id}" hidden>${corpo}</div>
    </section>`;

  function esqueleto() {
    const raiz = $("aba-financeiro");
    raiz.innerHTML = `
      <p id="fin-msg" class="prod-msg" hidden></p>
      <header class="fin-hero">
        <div class="fin-hero-txt">
          <span class="fin-eyebrow">Gestão · CG Acessórios</span>
          <h1 class="fin-titulo">Painel financeiro</h1>
          <p id="fin-atualizado" class="fin-hero-sub"></p>
        </div>
        <div class="fin-hero-acoes">
          <button type="button" class="btn btn-line" data-acao="baixar">Baixar estoque (planilha)</button>
          <button type="button" class="btn btn-line" data-acao="precos">Aplicar preços no site</button>
        </div>
      </header>
      <nav class="fin-nav" aria-label="Seções do financeiro">
        <button type="button" data-ir="resumo">Resumo</button>
        <button type="button" data-ir="joias">Valor em jóias</button>
        <button type="button" data-ir="graficos">Gráficos</button>
        <button type="button" data-ir="criterios">Critérios</button>
        <button type="button" data-ir="estoque">Controle de estoque</button>
        <button type="button" data-ir="vendas">Vendas</button>
      </nav>
      <p class="fin-topo">Estoque e vendas vêm da planilha de Controle de Estoque: envie em <strong>Produtos &gt; Importar planilha</strong> e esta aba se atualiza junto. Custo e preço de venda você define aqui e ficam salvos.</p>

      <section class="fin-sec" id="fin-sec-resumo">
        ${cabecalhoSec("1", "Resumo", "Os quatro números que mais importam")}
        <div id="fin-resumo" class="fin-kpis"></div>
        <div id="fin-detalhes" class="fin-minis"></div>
      </section>

      <section class="fin-sec" id="fin-sec-joias">
        ${cabecalhoSec("2", "Valor total em jóias", "Par, Unidade e Trio — no estoque e nas peças vendidas")}
        <div id="fin-tipos"></div>
      </section>

      <section class="fin-sec" id="fin-sec-graficos">
        ${cabecalhoSec("3", "Gráficos", "Vendas, situação do estoque e ranking de modelos")}
        <div id="fin-graficos" class="fin-grade"></div>
      </section>

      ${secaoDrop("criterios", "4", "Critérios de preço", "Valores de Par, Unidade, Trio, custo e multiplicador", `<div id="fin-criterios"></div><p id="fin-msg-criterios" class="prod-msg" hidden></p>`)}

      ${secaoDrop("estoque", "5", "Controle de estoque", "Todas as peças, com custo e preço de venda editáveis", `
        <div class="prod-barra">
          <input type="search" id="fin-busca" class="prod-busca" placeholder="Buscar modelo ou peça...">
          <div class="prod-acoes">
            <button type="button" class="btn btn-line" data-acao="baixar">Baixar todas as peças</button>
            <button type="button" class="btn btn-line" data-acao="precos">Aplicar preços no site</button>
          </div>
        </div>
        <div id="fin-modelos" class="fin-rolagem"></div>`)}

      ${secaoDrop("vendas", "6", "Vendas", "Resumo por mês e todas as saídas da planilha", `<div id="fin-vendas"></div>`)}`;
    DROPS.forEach((id) => { try { if (localStorage.getItem(dropKey(id)) === "1") definirDrop(id, true); } catch (e) { /* começa fechado */ } });
  }

  async function abrir() {
    const raiz = $("aba-financeiro");
    if (!raiz) return;
    if (!$("fin-resumo")) esqueleto();
    const [rc, rm, rv, rp] = await Promise.all([
      db.from("financeiro_config").select("*").eq("chave", "criterios"),
      db.from("financeiro_modelos").select("*").order("modelo"),
      db.from("financeiro_vendas").select("*").order("id"),
      db.from("produtos").select("*"),
    ]);
    const falha = [rc, rm, rv].find((r) => r.error);
    if (falha) {
      semTabela = ehTabelaAusente(falha.error);
      aviso(semTabela ? MSG_SEM_TABELA : "Erro ao carregar o financeiro: " + falha.error.message, "erro");
      return;
    }
    semTabela = false;
    const linhaCfg = rc.data && rc.data[0];
    let valorCfg = (linhaCfg && linhaCfg.valor) || null;
    const loc = lerLocal();
    if (loc && loc.valor && (!linhaCfg || new Date(loc.ts) > new Date(linhaCfg.updated_at || 0))) valorCfg = loc.valor;
    cfg = juntaCfg(valorCfg);
    modelos = (rm.data || []).map((m) => ({ ...m, estoque: Number(m.estoque) || 0, comprado: Number(m.comprado) || 0, vendido: Number(m.vendido) || 0 }));
    vendas = rv.data || [];
    produtosSite = rp.data || [];
    desenharTudo();
  }

  function iniciar() {
    const raiz = $("aba-financeiro");
    if (!raiz) return;
    raiz.addEventListener("click", (e) => {
      const t = e.target;
      const em = (sel) => (t.closest ? t.closest(sel) : null);
      if (t.id === "fin-salvar-criterios") return salvarCriterios(t);
      if (em('[data-acao="precos"]')) return verPrecosParaOSite();
      if (em('[data-acao="baixar"]')) return baixarEstoque();
      const d = em("[data-drop]");
      if (d) return alternarDrop(d.dataset.drop);
      const ir = em("[data-ir]");
      if (ir) irPara(ir.dataset.ir);
    });
    raiz.addEventListener("input", (e) => {
      if (e.target.id === "fin-busca") desenharModelos();
      if (e.target.id === "fin-markup" || e.target.id === "fin-arredondar") atualizarExemplo();
    });
    raiz.addEventListener("change", (e) => {
      if (e.target.classList.contains("fin-in")) salvarCampo(e.target);
      if (e.target.id === "fin-arredondar") atualizarExemplo();
    });
    raiz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.classList.contains("fin-in")) e.target.blur();
    });
  }

  const ESTILO = `
#aba-financeiro[hidden] { display: none !important; }
#aba-financeiro {
  --fin-card: var(--bone-2);
  --fin-borda: rgba(122, 33, 66, 0.18);
  --fin-trilho: rgba(122, 33, 66, 0.13);
  --fin-sombra: 0 10px 28px rgba(58, 20, 32, 0.08);
  --fin-sombra-forte: 0 14px 34px rgba(58, 20, 32, 0.16);
  --fin-grad: linear-gradient(90deg, #e07a9a, #7a2142);
  color: var(--ink);
}
[data-theme="dark"] #aba-financeiro {
  --fin-borda: rgba(234, 173, 195, 0.22);
  --fin-trilho: rgba(234, 173, 195, 0.16);
  --fin-sombra: 0 10px 28px rgba(0, 0, 0, 0.35);
  --fin-sombra-forte: 0 14px 34px rgba(0, 0, 0, 0.5);
}
#fin-msg { position: sticky; top: 8px; z-index: 60; box-shadow: 0 4px 14px rgba(0,0,0,.18); }

/* ---------- topo (hero) ---------- */
.fin-hero { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; flex-wrap: wrap; padding: 1.9rem 2rem; margin-bottom: 1rem; border-radius: 26px; color: #3a1420; background: linear-gradient(125deg, #F8D3E0 0%, #F1AFC7 55%, #E58FB0 100%); box-shadow: var(--fin-sombra-forte); }
.fin-hero::after { content: ""; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,.55), rgba(255,255,255,0) 70%); pointer-events: none; }
.fin-hero-txt { position: relative; z-index: 1; min-width: 0; }
.fin-eyebrow { display: block; font-size: 0.74rem; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.75; margin-bottom: 0.35rem; }
.fin-titulo { margin: 0; font-family: var(--font-display, inherit); font-size: clamp(2rem, 5vw, 2.9rem); line-height: 1.05; color: #3a1420; }
.fin-hero-sub { margin: 0.55rem 0 0; font-size: 0.86rem; opacity: 0.8; max-width: 620px; }
.fin-hero-acoes { position: relative; z-index: 1; display: flex; gap: 0.6rem; flex-wrap: wrap; }
.fin-hero .btn { background: rgba(255,255,255,.75); color: #3a1420; border: 2px solid #3a1420; }
.fin-hero .btn:hover { background: #3a1420; color: #fff; border-color: #3a1420; }

/* ---------- navegação por seções ---------- */
.fin-nav { display: flex; gap: 0.5rem; overflow-x: auto; padding: 0.2rem 0 0.6rem; margin-bottom: 0.5rem; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.fin-nav::-webkit-scrollbar { display: none; }
.fin-nav button { flex: 0 0 auto; padding: 0.5em 1.05em; border-radius: 999px; border: 1px solid var(--fin-borda); background: var(--fin-card); color: var(--ink); font: inherit; font-size: 0.84rem; cursor: pointer; transition: background .15s, color .15s, transform .15s; }
.fin-nav button:hover { background: var(--gold-dim); color: var(--page-bg); transform: translateY(-1px); }
.fin-topo { margin: 0 0 1.75rem; font-size: 0.82rem; color: var(--muted); }

/* ---------- seções ---------- */
.fin-sec { margin: 0 0 2.6rem; scroll-margin-top: 84px; }
.fin-sec-cab { display: flex; align-items: center; gap: 0.9rem; margin-bottom: 1.15rem; }
.fin-sec-cab h2 { margin: 0; font-family: var(--font-display, inherit); font-size: 1.75rem; line-height: 1.1; }
.fin-sec-cab p { margin: 0.15rem 0 0; font-size: 0.86rem; color: var(--muted); }
.fin-num-sec { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; background: var(--gold-dim); color: var(--page-bg); font-weight: 600; font-size: 0.95rem; }

/* ---------- indicadores ---------- */
.fin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
.fin-kpi { position: relative; overflow: hidden; display: flex; align-items: center; gap: 0.95rem; padding: 1.2rem 1.25rem; background: var(--fin-card); border: 1px solid var(--fin-borda); border-radius: 22px; box-shadow: var(--fin-sombra); }
.fin-kpi::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--kpi); }
.fin-kpi-icone { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; color: var(--kpi); background: rgba(122, 33, 66, 0.1); background: color-mix(in srgb, var(--kpi) 16%, transparent); }
.fin-kpi-icone svg { width: 24px; height: 24px; }
.fin-kpi-txt { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.fin-rotulo { font-size: 0.8rem; opacity: 0.75; letter-spacing: 0.02em; }
.fin-valor { font-family: var(--font-display, inherit); font-size: 1.85rem; line-height: 1.1; overflow-wrap: anywhere; }
.fin-dica { font-size: 0.74rem; opacity: 0.65; }
.fin-minis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
.fin-mini { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.85rem 1rem; border: 1px dashed var(--fin-borda); border-radius: 16px; }
.fin-mini strong { font-size: 1.1rem; }

/* ---------- painéis ---------- */
.fin-painel { min-width: 0; padding: 1.3rem; background: var(--fin-card); border: 1px solid var(--fin-borda); border-radius: 24px; box-shadow: var(--fin-sombra); }
.fin-painel-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.fin-painel-cab h3 { margin: 0; font-family: var(--font-display, inherit); font-size: 1.4rem; }
.fin-painel-sub { font-size: 0.8rem; color: var(--muted); }
.fin-duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem; }
.fin-total { display: flex; flex-direction: column; gap: 0.15rem; padding: 1.05rem 1.25rem; margin-bottom: 1.15rem; border-radius: 18px; color: #fff; background: linear-gradient(135deg, #7a2142, #b0416b); box-shadow: 0 8px 20px rgba(122, 33, 66, 0.3); }
.fin-total span { font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
.fin-total strong { font-family: var(--font-display, inherit); font-size: 2.15rem; line-height: 1.1; overflow-wrap: anywhere; }
.fin-total small { font-size: 0.76rem; opacity: 0.8; }
.fin-tipos-lista { list-style: none; margin: 0; padding: 0; }
.fin-tipos-lista li { margin-bottom: 1.05rem; }
.fin-tipos-lista li:last-child { margin-bottom: 0; }
.fin-tipo-topo { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.4rem; }
.fin-tipo-nome { font-weight: 600; }
.fin-tipo-nome em { margin-left: 0.5rem; font-style: normal; font-weight: 400; font-size: 0.8rem; opacity: 0.65; }
.fin-tipo-topo strong { font-size: 1.08rem; white-space: nowrap; }
.fin-tipos-lista small { display: block; margin-top: 0.3rem; font-size: 0.76rem; opacity: 0.65; }
.fin-recebido { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 1.1rem; padding-top: 0.95rem; border-top: 1px dashed var(--fin-borda); font-size: 0.88rem; }
.fin-recebido strong { font-size: 1.1rem; }
.fin-nota { margin: 0.9rem 0 0; font-size: 0.78rem; color: var(--muted); }
.fin-hbar { height: 10px; border-radius: 999px; background: var(--fin-trilho); overflow: hidden; }
.fin-hbar i { display: block; height: 100%; min-width: 3px; border-radius: 999px; background: var(--fin-grad); transition: width .45s ease; }

/* ---------- gráficos ---------- */
.fin-grade { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 1.1rem; }
.fin-c7 { grid-column: span 7; }
.fin-c5 { grid-column: span 5; }
.fin-c6 { grid-column: span 6; }
.fin-vazio { margin: 0; padding: 1.6rem 1rem; text-align: center; font-size: 0.88rem; color: var(--muted); border: 1px dashed var(--fin-borda); border-radius: 16px; }
.fin-colunas { display: flex; align-items: flex-end; gap: 0.6rem; overflow-x: auto; padding-bottom: 0.4rem; }
.fin-col { flex: 1 0 58px; min-width: 58px; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }
.fin-col-val { font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
.fin-col-area { width: 100%; height: 150px; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid var(--fin-borda); }
.fin-col-barra { width: 68%; max-width: 46px; border-radius: 12px 12px 4px 4px; background: linear-gradient(180deg, #e07a9a, #7a2142); transition: height .45s ease; }
.fin-col-rot { font-size: 0.78rem; font-weight: 600; }
.fin-col-sub { font-size: 0.68rem; opacity: 0.65; white-space: nowrap; }
.fin-donut-wrap { display: flex; align-items: center; justify-content: center; gap: 1.4rem; flex-wrap: wrap; }
.fin-donut { position: relative; flex: 0 0 auto; width: 176px; height: 176px; }
.fin-donut svg { display: block; width: 100%; height: 100%; }
.fin-donut-centro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.fin-donut-centro strong { font-family: var(--font-display, inherit); font-size: 1.9rem; line-height: 1; }
.fin-donut-centro span { font-size: 0.75rem; opacity: 0.7; }
.fin-legenda { list-style: none; margin: 0; padding: 0; flex: 1 1 180px; min-width: 0; }
.fin-legenda li { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; padding: 0.42rem 0; border-bottom: 1px dashed var(--fin-borda); font-size: 0.85rem; }
.fin-legenda li:last-child { border-bottom: 0; }
.fin-legenda i { width: 12px; height: 12px; border-radius: 4px; }
.fin-leg-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fin-leg-val { font-weight: 600; white-space: nowrap; }
.fin-leg-val em { font-style: normal; font-weight: 400; opacity: 0.65; margin-left: 0.25rem; }
.fin-rank { list-style: none; margin: 0; padding: 0; }
.fin-rank li { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.85rem; }
.fin-rank li:last-child { margin-bottom: 0; }
.fin-rank-n { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: var(--fin-trilho); font-size: 0.75rem; font-weight: 600; }
.fin-rank-corpo { flex: 1; min-width: 0; }
.fin-rank-top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.3rem; }
.fin-rank-nome { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem; }
.fin-rank-nome span { opacity: 0.65; }
.fin-rank-top strong { font-size: 0.85rem; white-space: nowrap; }

/* ---------- seções em drop ---------- */
.fin-h2-drop { margin: 0; }
.fin-drop { display: flex; align-items: center; gap: 0.95rem; width: 100%; padding: 1rem 1.2rem; background: var(--fin-card); border: 1px solid var(--fin-borda); border-radius: 22px; box-shadow: var(--fin-sombra); color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: transform .15s, box-shadow .15s; }
.fin-drop:hover { transform: translateY(-1px); box-shadow: var(--fin-sombra-forte); }
.fin-drop:focus-visible { outline: 2px solid var(--gold-dim); outline-offset: 3px; }
.fin-drop-txt { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.fin-drop-titulo { font-family: var(--font-display, inherit); font-size: 1.6rem; font-weight: 600; line-height: 1.1; }
.fin-drop-sub { font-family: var(--font-body, inherit); font-size: 0.82rem; font-weight: 400; color: var(--muted); }
.fin-drop-resumo { flex: 0 1 auto; max-width: 42%; font-size: 0.82rem; opacity: 0.8; text-align: right; }
.fin-seta { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 2px solid currentColor; border-radius: 50%; font-size: 1rem; transition: transform .2s; }
.fin-drop.aberto .fin-seta { transform: rotate(180deg); }
.fin-corpo { margin-top: 0.9rem; padding: 1.3rem; background: var(--fin-card); border: 1px solid var(--fin-borda); border-radius: 24px; box-shadow: var(--fin-sombra); }
.fin-corpo[hidden] { display: none; }
.fin-corpo .prod-barra { margin-bottom: 1rem; }

/* ---------- formulário de critérios ---------- */
.fin-grupos { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.1rem; margin-bottom: 1rem; }
.fin-grupo { padding: 1.1rem 1.2rem; border: 1px solid var(--fin-borda); border-radius: 18px; }
.fin-grupo h4 { margin: 0 0 0.8rem; font-family: var(--font-display, inherit); font-size: 1.2rem; }
.fin-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.4rem 1rem; }
.fin-form .field { margin-bottom: 0.4rem; }

/* ---------- tabelas ---------- */
.fin-rolagem { overflow-x: auto; }
.fin-sub-titulo { margin: 1.3rem 0 0.6rem; font-family: var(--font-display, inherit); font-size: 1.25rem; }
.fin-sub-titulo:first-child { margin-top: 0; }
.fin-tabela { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.88rem; }
.fin-tabela th { padding: 0.6rem 0.45rem; text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.25; background: var(--fin-trilho); }
.fin-tabela th:first-child { border-radius: 12px 0 0 12px; }
.fin-tabela th:last-child { border-radius: 0 12px 12px 0; }
.fin-tabela td { padding: 0.55rem 0.45rem; text-align: left; border-bottom: 1px solid var(--fin-borda); vertical-align: middle; }
.fin-tabela tbody tr:hover td { background: var(--fin-trilho); }
.fin-tabela .fin-num { text-align: right; white-space: nowrap; }
.fin-tabela th:nth-child(n+3) { text-align: left; }
.fin-tabela .fin-nome { min-width: 150px; }
.fin-tabela tr.fin-zero { opacity: 0.55; }
.fin-tabela-pequena { max-width: 560px; }
.fin-selo { display: inline-block; padding: 0.22em 0.75em; border-radius: 999px; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; white-space: nowrap; }
.fin-selo-bom { background: rgba(91, 138, 114, 0.2); color: #2f6b4a; }
.fin-selo-baixo { background: rgba(212, 160, 23, 0.22); color: #8a6508; }
.fin-selo-zero { background: rgba(194, 85, 122, 0.2); color: #9c2f58; }
[data-theme="dark"] .fin-selo-bom { color: #8fd0ae; }
[data-theme="dark"] .fin-selo-baixo { color: #f0c452; }
[data-theme="dark"] .fin-selo-zero { color: #f2a3bf; }
.fin-in { width: 78px; box-sizing: border-box; padding: 0.4em 0.7em; border-radius: 999px; border: 1px solid var(--gold-dim); background: var(--page-bg); color: var(--ink); font-family: var(--font-body); font-size: 0.85rem; text-align: right; }
.fin-in:focus { outline: 2px solid var(--gold-dim); outline-offset: 1px; }

/* ---------- tablet ---------- */
@media (max-width: 980px) {
  .fin-duo { grid-template-columns: minmax(0, 1fr); }
  .fin-c7, .fin-c5, .fin-c6 { grid-column: 1 / -1; }
}

/* ---------- celular ---------- */
@media (max-width: 720px) {
  .fin-hero { padding: 1.35rem 1.25rem; border-radius: 22px; }
  .fin-hero-acoes { width: 100%; }
  .fin-hero-acoes .btn { flex: 1 1 100%; text-align: center; }
  .fin-sec { margin-bottom: 2rem; }
  .fin-sec-cab h2 { font-size: 1.45rem; }
  .fin-num-sec { width: 34px; height: 34px; }
  .fin-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
  .fin-minis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
  .fin-mini { padding: 0.7rem 0.8rem; }
  .fin-kpi { flex-direction: column; align-items: flex-start; gap: 0.6rem; padding: 1rem; border-radius: 18px; }
  .fin-kpi-icone { width: 40px; height: 40px; }
  .fin-kpi-icone svg { width: 20px; height: 20px; }
  .fin-valor { font-size: 1.4rem; }
  .fin-painel { padding: 1.05rem; border-radius: 20px; }
  .fin-total strong { font-size: 1.75rem; }
  .fin-drop { padding: 0.85rem 0.95rem; gap: 0.7rem; border-radius: 18px; }
  .fin-drop-titulo { font-size: 1.3rem; }
  .fin-drop-resumo { display: none; }
  .fin-corpo { padding: 1rem; border-radius: 20px; }
  .fin-grupos { grid-template-columns: minmax(0, 1fr); }
  .fin-corpo .prod-acoes, .fin-corpo .prod-acoes .btn { width: 100%; }
  .fin-donut { width: 150px; height: 150px; }

  /* tabelas viram cartões, um por linha da planilha */
  .fin-responsiva, .fin-responsiva tbody, .fin-responsiva tr, .fin-responsiva td { display: block; width: 100%; }
  .fin-responsiva thead { display: none; }
  .fin-tabela-pequena { max-width: none; }
  .fin-responsiva tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem 0.9rem; padding: 0.9rem 1rem; margin-bottom: 0.75rem; border: 1px solid var(--fin-borda); border-radius: 16px; background: var(--page-bg); }
  .fin-responsiva td { display: flex; flex-direction: column; gap: 0.1rem; padding: 0; border: 0; text-align: left !important; min-width: 0; }
  .fin-responsiva td::before { content: attr(data-label); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.6; }
  .fin-responsiva td.fin-full { grid-column: 1 / -1; }
  .fin-tabela .fin-nome { min-width: 0; }
  .fin-responsiva td .fin-selo { align-self: flex-start; }
  .fin-tabela tbody tr:hover td { background: transparent; }
  .fin-in { width: 100%; text-align: left; padding: 0.55em 0.9em; }
}
@media (max-width: 380px) {
  .fin-kpis { grid-template-columns: minmax(0, 1fr); }
}
`;

  function injetarEstilo() {
    if (document.getElementById("gestao-financeiro-css")) return;
    const el = document.createElement("style");
    el.id = "gestao-financeiro-css";
    el.textContent = ESTILO;
    document.head.appendChild(el);
  }

  window.GestaoFinanceiro = { abrir, lerPlanilha, aplicar };
  injetarEstilo();
  document.addEventListener("DOMContentLoaded", iniciar);
})();
