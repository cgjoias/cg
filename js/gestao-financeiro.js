// ============================================================
// ABA "FINANCEIRO" DA GESTÃO
// Controle de estoque em valor, preço de venda e vendas.
// - Os números de estoque/vendas vêm da planilha de Controle de Estoque
//   (a mesma que você envia em Produtos > Importar planilha).
// - Custo e preço de venda você define aqui e ficam salvos.
// Tabelas PRIVADAS no Supabase (schema-financeiro.sql): só quem está logado lê.
// ============================================================
(function () {
  const PADRAO = { markup: 3, custo_padrao: null, arredondar: false, descontar_frete: false };
  const MSG_SEM_TABELA = "As tabelas do financeiro ainda não existem no Supabase. Abra o arquivo schema-financeiro.sql, copie tudo e rode em SQL Editor > New query > Run. Depois recarregue esta página.";

  let cfg = { ...PADRAO };
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

  function aviso(texto, tipo) {
    const el = $("fin-msg");
    if (!el) return;
    el.textContent = texto;
    el.className = "prod-msg " + (tipo === "erro" ? "erro" : "ok");
    el.hidden = false;
    clearTimeout(aviso.t);
    if (tipo !== "erro") aviso.t = setTimeout(() => (el.hidden = true), 6000);
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
  const card = (rotulo, valor, dica) =>
    `<div class="fin-card"><span class="fin-rotulo">${esc(rotulo)}</span><strong class="fin-valor">${esc(valor)}</strong>${dica ? `<span class="fin-dica">${esc(dica)}</span>` : ""}</div>`;

  function desenharResumo() {
    const e = totaisEstoque(), v = totaisVendas();
    const alvo = $("fin-resumo");
    if (!alvo) return;
    alvo.innerHTML = [
      card("Peças em estoque", inteiro(e.pecas), `${inteiro(modelos.length)} modelos`),
      card("Valor do estoque (custo)", moeda(e.valorCusto), "quanto você investiu no que está parado"),
      card("Valor do estoque (venda)", moeda(e.valorVenda), e.semDados ? `${e.semDados} modelo(s) com estoque sem custo ou preço definidos ficam fora` : "se vender tudo pelo preço de venda"),
      card("Lucro potencial do estoque", moeda(e.lucro), "venda − custo, só de quem tem os dois"),
      card("Total vendido", moeda(v.receita), `${inteiro(v.pecas - v.brindes)} peça(s) vendidas · ${inteiro(v.brindes)} brinde(s)`),
      card("Custo das peças vendidas", moeda(v.custo), v.semCusto ? `${v.semCusto} saída(s) sem custo definido não entram` : "custo × quantidade"),
      card("Lucro das vendas", moeda(v.lucro), cfg.descontar_frete ? "já descontado o frete" : "sem descontar o frete"),
      card("Frete informado", moeda(v.frete), "soma da coluna PR FRETE"),
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

  function linhaModelo(m) {
    const c = celulasCalculadas(m);
    const nome = nomeDoModelo(m);
    const cls = m.estoque <= 0 ? "fin-zero" : "";
    return `<tr data-m="${esc(m.modelo)}" class="${cls}">
      <td><strong>${esc(m.modelo)}</strong></td>
      <td class="fin-nome">${esc(nome) || "—"}</td>
      <td class="fin-num">${inteiro(m.estoque)}</td>
      <td class="fin-num">${inteiro(m.comprado)}</td>
      <td class="fin-num">${inteiro(m.vendido)}</td>
      <td>${esc(m.situacao || "")}</td>
      <td><input class="fin-in" data-campo="custo" data-m="${esc(m.modelo)}" inputmode="decimal" value="${campoNum(m.custo)}" placeholder="${cfg.custo_padrao != null ? campoNum(cfg.custo_padrao) : "0,00"}"></td>
      <td><input class="fin-in" data-campo="preco_venda" data-m="${esc(m.modelo)}" inputmode="decimal" value="${campoNum(m.preco_venda)}" placeholder="${vendaEf({ ...m, preco_venda: null }) != null ? campoNum(vendaEf({ ...m, preco_venda: null })) : "auto"}"></td>
      <td class="fin-num" data-cel="venda">${esc(c.venda)}</td>
      <td class="fin-num" data-cel="margem">${esc(c.margem)}</td>
      <td class="fin-num" data-cel="valor">${esc(c.valor)}</td>
    </tr>`;
  }

  function desenharModelos() {
    const termo = norm(($("fin-busca") || {}).value);
    const lista = modelos.filter((m) => !termo || norm(m.modelo).includes(termo) || norm(nomeDoModelo(m)).includes(termo));
    $("fin-modelos").innerHTML = lista.length
      ? `<table class="fin-tabela"><thead><tr>
          <th>Modelo</th><th>Peça</th><th>Em estoque</th><th>Comprado</th><th>Saídas</th><th>Situação</th>
          <th>Custo (R$)</th><th>Preço de venda (R$)</th><th>Venda final</th><th>Margem</th><th>Valor em estoque</th>
        </tr></thead><tbody>${lista.map(linhaModelo).join("")}</tbody></table>`
      : `<p class="field-hint">${modelos.length ? "Nenhum modelo encontrado." : "Ainda não há dados. Vá em Produtos > Importar planilha e envie a planilha de Controle de Estoque: ela alimenta esta aba."}</p>`;
  }

  const dataBR = (d) => (d ? d.split("-").reverse().join("/") : "—");

  function desenharVendas() {
    const alvo = $("fin-vendas");
    if (!vendas.length) { alvo.innerHTML = `<p class="field-hint">Nenhuma venda registrada na aba SAIDA da planilha.</p>`; return; }
    // por mês
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
      `<tr><td>${esc(nomeMes(k))}</td><td class="fin-num">${inteiro(o.pecas - o.brindes)}</td><td class="fin-num">${inteiro(o.brindes)}</td><td class="fin-num">${moeda(o.receita)}</td></tr>`).join("");
    const linhas = [...vendas].sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b.id - a.id).map((v) => {
      const m = acharModelo(v.modelo);
      const c = m ? custoEf(m) : null;
      const custo = c != null ? c * v.qtd : null;
      const lucro = custo != null ? (v.valor != null ? Number(v.valor) : 0) - custo : null;
      return `<tr>
        <td>${esc(dataBR(v.data))}</td><td>${esc(v.modelo)}</td><td>${esc(v.numeracao || "")}</td><td class="fin-num">${inteiro(v.qtd)}</td>
        <td>${esc(v.cliente || "")}</td>
        <td class="fin-num">${v.brinde ? "BRINDE" : v.valor != null ? moeda(v.valor) : "—"}</td>
        <td class="fin-num">${v.retirada ? "Retirada" : v.frete != null ? moeda(v.frete) : "—"}</td>
        <td class="fin-num">${custo != null ? moeda(custo) : "—"}</td>
        <td class="fin-num">${lucro != null ? moeda(lucro) : "—"}</td>
      </tr>`;
    }).join("");
    alvo.innerHTML = `
      <h3>Por mês</h3>
      <div class="fin-rolagem"><table class="fin-tabela fin-tabela-pequena"><thead><tr><th>Mês</th><th>Peças vendidas</th><th>Brindes</th><th>Total vendido</th></tr></thead><tbody>${porMes}</tbody></table></div>
      <h3>Saídas, da mais recente para a mais antiga</h3>
      <div class="fin-rolagem"><table class="fin-tabela"><thead><tr><th>Data</th><th>Modelo</th><th>Nº</th><th>Qtd</th><th>Cliente</th><th>Valor</th><th>Frete</th><th>Custo</th><th>Lucro da linha</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  function desenharCriterios() {
    const ex = 20;
    $("fin-criterios").innerHTML = `
      <div class="fin-form">
        <div class="field"><label for="fin-custo-padrao">Custo padrão por peça (R$)</label>
          <input type="text" id="fin-custo-padrao" inputmode="decimal" value="${campoNum(cfg.custo_padrao)}" placeholder="ex.: 20,00">
          <span class="field-hint">Usado nos modelos que não têm custo próprio na tabela abaixo.</span></div>
        <div class="field"><label for="fin-markup">Multiplicador sobre o custo (×)</label>
          <input type="text" id="fin-markup" inputmode="decimal" value="${campoNum(cfg.markup)}" placeholder="ex.: 3">
          <span class="field-hint" id="fin-exemplo"></span></div>
        <label class="prod-check"><input type="checkbox" id="fin-arredondar" ${cfg.arredondar ? "checked" : ""}> Arredondar o preço calculado para terminar em ,90</label>
        <label class="prod-check"><input type="checkbox" id="fin-frete" ${cfg.descontar_frete ? "checked" : ""}> Descontar o frete do lucro das vendas (marque se a loja paga o frete)</label>
      </div>
      <p class="field-hint">Cada modelo pode ter custo e preço de venda próprios na tabela abaixo; o que estiver preenchido lá vale mais que estes critérios. Preço de venda em branco = custo × multiplicador.</p>
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
    const custo = String($("fin-custo-padrao").value).trim() === "" ? null : lerNumero($("fin-custo-padrao").value);
    const mult = lerNumero($("fin-markup").value);
    if ($("fin-custo-padrao").value.trim() !== "" && custo === null) return aviso("Custo padrão inválido. Use números, por exemplo 20,00.", "erro");
    if (!(mult > 0)) return aviso("Informe um multiplicador maior que zero, por exemplo 3.", "erro");
    const novo = { markup: mult, custo_padrao: custo, arredondar: $("fin-arredondar").checked, descontar_frete: $("fin-frete").checked };
    botao.disabled = true;
    const { error } = await db.from("financeiro_config").upsert({ chave: "criterios", valor: novo, updated_at: new Date().toISOString() }, { onConflict: "chave" });
    botao.disabled = false;
    if (error) return aviso(ehTabelaAusente(error) ? MSG_SEM_TABELA : "Não foi possível salvar: " + error.message, "erro");
    cfg = { ...PADRAO, ...novo };
    desenharTudo();
    aviso("Critérios salvos.");
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
    desenharVendas();
  }

  // ---------- levar os preços de venda para o site ----------
  function precosParaOSite() {
    const mudancas = [];
    produtosSite.forEach((p) => {
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

  // ---------- montagem ----------
  function desenharTudo() {
    desenharResumo();
    desenharCriterios();
    desenharModelos();
    desenharVendas();
  }

  function esqueleto() {
    const raiz = $("aba-financeiro");
    raiz.innerHTML = `
      <p id="fin-msg" class="prod-msg" hidden></p>
      <p class="field-hint fin-topo">Estoque e vendas vêm da planilha de Controle de Estoque: envie em <strong>Produtos &gt; Importar planilha</strong> e esta aba se atualiza junto. Custo e preço de venda você define aqui e ficam salvos.</p>
      <section class="gestao-secao"><h2>Resumo</h2><div id="fin-resumo" class="fin-cards"></div></section>
      <section class="gestao-secao"><h2>Critérios de preço</h2><div id="fin-criterios"></div></section>
      <section class="gestao-secao"><h2>Estoque por modelo</h2>
        <div class="prod-barra">
          <input type="search" id="fin-busca" class="prod-busca" placeholder="Buscar modelo ou peça...">
          <div class="prod-acoes"><button type="button" class="btn btn-line" id="fin-enviar-site">Aplicar preços no site</button></div>
        </div>
        <div id="fin-modelos" class="fin-rolagem"></div>
      </section>
      <section class="gestao-secao"><h2>Vendas</h2><div id="fin-vendas"></div></section>`;
  }

  async function abrir() {
    const raiz = $("aba-financeiro");
    if (!raiz) return;
    if (!$("fin-resumo")) esqueleto();
    const [rc, rm, rv, rp] = await Promise.all([
      db.from("financeiro_config").select("*").eq("chave", "criterios"),
      db.from("financeiro_modelos").select("*").order("modelo"),
      db.from("financeiro_vendas").select("*").order("id"),
      db.from("produtos").select("id,nome,codigo,preco"),
    ]);
    const falha = [rc, rm, rv].find((r) => r.error);
    if (falha) {
      semTabela = ehTabelaAusente(falha.error);
      aviso(semTabela ? MSG_SEM_TABELA : "Erro ao carregar o financeiro: " + falha.error.message, "erro");
      return;
    }
    semTabela = false;
    cfg = { ...PADRAO, ...((rc.data && rc.data[0] && rc.data[0].valor) || {}) };
    modelos = (rm.data || []).map((m) => ({ ...m, estoque: Number(m.estoque) || 0, comprado: Number(m.comprado) || 0, vendido: Number(m.vendido) || 0 }));
    vendas = rv.data || [];
    produtosSite = rp.data || [];
    desenharTudo();
  }

  function iniciar() {
    const raiz = $("aba-financeiro");
    if (!raiz) return;
    raiz.addEventListener("click", (e) => {
      if (e.target.id === "fin-salvar-criterios") salvarCriterios(e.target);
      if (e.target.id === "fin-enviar-site") verPrecosParaOSite();
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
.fin-topo { margin: 0 0 1.25rem; }
.fin-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.85rem; }
.fin-card { display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem 1.1rem; background: var(--surface); border: 1px solid var(--bone-2); border-radius: var(--radius-m); }
.fin-rotulo { font-size: 0.82rem; opacity: 0.75; }
.fin-valor { font-family: var(--font-display, inherit); font-size: 1.55rem; line-height: 1.15; }
.fin-dica { font-size: 0.75rem; opacity: 0.65; }
.fin-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.5rem 1.25rem; margin-bottom: 0.75rem; align-items: start; }
.fin-form .prod-check { grid-column: 1 / -1; margin: 0; }
.fin-rolagem { overflow-x: auto; }
.fin-tabela { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.fin-tabela th, .fin-tabela td { padding: 0.5rem 0.6rem; text-align: left; border-bottom: 1px solid var(--bone-2); vertical-align: middle; }
.fin-tabela th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.fin-tabela .fin-num { text-align: right; white-space: nowrap; }
.fin-tabela .fin-nome { min-width: 220px; }
.fin-tabela tr.fin-zero { opacity: 0.55; }
.fin-tabela-pequena { max-width: 560px; }
.fin-in { width: 92px; box-sizing: border-box; padding: 0.35em 0.6em; border-radius: 999px; border: 1px solid var(--gold-dim); background: var(--surface); color: var(--ink); font-family: var(--font-body); font-size: 0.85rem; text-align: right; }
.fin-in:focus { outline: 2px solid var(--gold-dim); outline-offset: 1px; }
#aba-financeiro h3 { margin: 1.25rem 0 0.5rem; font-size: 1rem; }
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
