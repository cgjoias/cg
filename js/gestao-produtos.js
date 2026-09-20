// ============================================================
// ABA "PRODUTOS" DA GESTÃO
// Cadastro, edição, fotos e planilha Excel dos produtos.
// Usa o mesmo login da aba Pedidos (Supabase Auth). Só quem está
// logado consegue gravar (regras RLS em schema-produtos.sql).
// ============================================================
(function () {
  const BUCKET = "produtos";
  const CATEGORIAS = { aneis: "Anéis", colares: "Colares", brincos: "Brincos", pulseiras: "Pulseiras" };
  const TEXTOS = ["material", "descricao", "codigo", "cor", "pedra", "largura", "formato", "acabamento", "detalhes"];
  const LISTAS = ["tamanhos", "tamanhos_feminino", "tamanhos_masculino"];
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

  // Colunas da planilha (k = coluna no banco, t = título no Excel)
  const COLUNAS = [
    { k: "id", t: "ID (não alterar)", w: 30 },
    { k: "nome", t: "Nome", w: 34 },
    { k: "categoria", t: "Categoria", w: 12 },
    { k: "material", t: "Material", w: 22 },
    { k: "preco", t: "Preço", w: 10 },
    { k: "descricao", t: "Descrição", w: 50 },
    { k: "codigo", t: "Código", w: 16 },
    { k: "cor", t: "Cor", w: 12 },
    { k: "pedra", t: "Pedra", w: 14 },
    { k: "largura", t: "Largura", w: 14 },
    { k: "formato", t: "Formato", w: 14 },
    { k: "acabamento", t: "Acabamento", w: 14 },
    { k: "detalhes", t: "Detalhes", w: 24 },
    { k: "tamanhos", t: "Tamanhos (separe por vírgula)", w: 28 },
    { k: "tamanhos_feminino", t: "Tamanhos feminino", w: 20 },
    { k: "tamanhos_masculino", t: "Tamanhos masculino", w: 20 },
    { k: "ativo", t: "Mostrar no site (Sim/Não)", w: 14 },
  ];
  const ROTULO = Object.fromEntries(COLUNAS.map((c) => [c.k, c.t.replace(/ \(.*\)/, "")]));

  let produtos = [];
  let ed = null; // estado do editor aberto

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const txtLista = (v) => (Array.isArray(v) ? v.join(", ") : "");

  function aviso(texto, tipo) {
    const el = $("prod-msg");
    el.textContent = texto;
    el.className = "prod-msg " + (tipo === "erro" ? "erro" : "ok");
    el.hidden = false;
    clearTimeout(aviso.t);
    if (tipo !== "erro") aviso.t = setTimeout(() => (el.hidden = true), 6000);
  }

  // ---------- utilidades ----------
  function lerNumero(v) {
    if (typeof v === "number") return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
    let t = String(v ?? "").replace(/R\$|\s/g, "");
    if (!t) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    const n = Number(t);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function listaDeTexto(v) {
    const itens = String(v ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    return itens.length ? itens : null;
  }

  function slug(nome) {
    return norm(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "produto";
  }

  function gerarId(nome, usados) {
    const base = slug(nome);
    const ocupados = new Set([...produtos.map((p) => p.id), ...(usados || [])]);
    let id = base, n = 2;
    while (ocupados.has(id)) id = base + "-" + n++;
    return id;
  }

  const proximaOrdem = () => produtos.reduce((m, p) => Math.max(m, p.ordem || 0), 0) + 1;

  function linhaVazia() {
    const o = { id: null, ordem: 0, ativo: true, categoria: "aneis", nome: "", preco: 0, imagens: [], variacoes: null };
    TEXTOS.forEach((k) => (o[k] = null));
    LISTAS.forEach((k) => (o[k] = null));
    return o;
  }

  // ---------- fotos ----------
  const caminhoDoStorage = (url) => {
    const partes = String(url).split(`/storage/v1/object/public/${BUCKET}/`);
    return partes.length === 2 ? decodeURIComponent(partes[1].split("?")[0]) : null;
  };

  async function apagarFotos(urls) {
    const caminhos = urls.map(caminhoDoStorage).filter(Boolean);
    if (!caminhos.length) return;
    try { await db.storage.from(BUCKET).remove(caminhos); } catch (e) { /* melhor esforço */ }
  }

  async function reduzirImagem(file, max = 1600) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { bmp = await createImageBitmap(file); }
    const fator = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * fator);
    c.height = Math.round(bmp.height * fator);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((ok, no) =>
      c.toBlob((b) => (b ? ok(b) : no(new Error("Não foi possível processar a imagem."))), "image/jpeg", 0.85)
    );
  }

  async function enviarFoto(file) {
    const blob = await reduzirImagem(file);
    const caminho = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await db.storage.from(BUCKET).upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw error;
    return db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }

  // ---------- modal ----------
  function abrirModal(html) {
    $("prod-modal-corpo").innerHTML = html;
    $("prod-modal").hidden = false;
    document.body.style.overflow = "hidden";
    $("prod-modal").scrollTop = 0;
  }
  function fecharModal() {
    $("prod-modal").hidden = true;
    $("prod-modal-corpo").innerHTML = "";
    document.body.style.overflow = "";
  }

  // ---------- lista ----------
  async function carregar() {
    const { data, error } = await db.from("produtos").select("*").order("ordem").order("created_at");
    if (error) {
      aviso("Erro ao carregar produtos: " + error.message + " (o arquivo schema-produtos.sql já foi executado no Supabase?)", "erro");
      return;
    }
    produtos = data;
    desenhar();
  }

  function desenhar() {
    const lista = $("prod-lista");
    const termo = norm($("prod-busca").value);
    $("prod-vazio").hidden = produtos.length > 0;
    const filtrados = produtos.filter((p) => !termo || norm(p.nome).includes(termo) || norm(p.codigo).includes(termo));
    lista.innerHTML = filtrados.map((p) => {
      const foto = (p.imagens && p.imagens[0]) || "assets/img/marca/logo.jpg";
      return `<article class="prod-card${p.ativo ? "" : " oculto"}" data-id="${esc(p.id)}" tabindex="0" role="button">
        <div class="prod-thumb"><img src="${esc(foto)}" alt="" loading="lazy"></div>
        <div class="prod-info">
          <h3>${esc(p.nome)}</h3>
          <p class="prod-sub">${esc(CATEGORIAS[p.categoria] || p.categoria)} · ${moeda(p.preco)}</p>
          <p class="prod-sub">${(p.imagens || []).length} foto(s)${p.ativo ? "" : ' · <span class="status-tag status-pendente">Oculto</span>'}</p>
        </div>
      </article>`;
    }).join("") || (produtos.length ? "<p>Nenhuma peça encontrada.</p>" : "");
  }

  // ---------- editor ----------
  const campo = (id, rotulo, valor, extra) =>
    `<div class="field"><label for="f-${id}">${rotulo}</label><input type="text" id="f-${id}" value="${esc(valor)}" ${extra || ""}></div>`;

  function abrirEditor(p) {
    ed = { p, fotos: p ? [...(p.imagens || [])] : [], enviadas: [], removidas: [] };
    const v = p || { ativo: true, categoria: "aneis", preco: "" };
    const opcoes = Object.entries(CATEGORIAS).map(([k, n]) => `<option value="${k}"${v.categoria === k ? " selected" : ""}>${n}</option>`).join("");
    abrirModal(`
      <h2>${p ? "Editar peça" : "Novo produto"}</h2>
      ${campo("nome", "Nome *", v.nome)}
      <div class="field-row">
        <div class="field"><label for="f-categoria">Categoria *</label><select id="f-categoria">${opcoes}</select></div>
        ${campo("preco", "Preço (R$) *", p ? String(v.preco).replace(".", ",") : "", 'inputmode="decimal" placeholder="129,90"')}
      </div>
      <div class="field-row">
        ${campo("material", "Material", v.material)}
        ${campo("codigo", "Código", v.codigo)}
      </div>
      ${campo("tamanhos", "Tamanhos (separe por vírgula)", txtLista(v.tamanhos), 'placeholder="14, 15, 16"')}
      <div class="field"><label for="f-descricao">Descrição</label><textarea id="f-descricao">${esc(v.descricao)}</textarea></div>
      <details class="prod-mais">
        <summary>Mais detalhes (opcional)</summary>
        <div class="field-row">${campo("cor", "Cor", v.cor)}${campo("pedra", "Pedra", v.pedra)}</div>
        <div class="field-row">${campo("largura", "Largura", v.largura)}${campo("formato", "Formato", v.formato)}</div>
        <div class="field-row">${campo("acabamento", "Acabamento", v.acabamento)}${campo("detalhes", "Detalhes", v.detalhes)}</div>
        <div class="field-row">
          ${campo("tamanhos_feminino", "Tamanhos feminino", txtLista(v.tamanhos_feminino))}
          ${campo("tamanhos_masculino", "Tamanhos masculino", txtLista(v.tamanhos_masculino))}
        </div>
      </details>
      <label class="prod-check"><input type="checkbox" id="f-ativo"${v.ativo ? " checked" : ""}> Mostrar no site</label>
      <div class="prod-fotos-bloco">
        <h3>Fotos <small>(a primeira é a capa)</small></h3>
        <div id="f-fotos-lista" class="prod-fotos"></div>
        <label class="btn btn-line prod-add-foto">＋ Adicionar fotos<input type="file" id="f-fotos" accept="image/*" multiple hidden></label>
        <p id="f-fotos-status" class="field-hint"></p>
      </div>
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" data-ed="salvar">Salvar</button>
        <button type="button" class="btn btn-line" data-ed="cancelar">Cancelar</button>
        ${p ? '<button type="button" class="btn btn-danger" data-ed="excluir">Excluir</button>' : ""}
      </div>`);
    desenharFotos();
  }

  function desenharFotos() {
    $("f-fotos-lista").innerHTML = ed.fotos.map((u, i) => `
      <div class="prod-foto">
        <img src="${esc(u)}" alt="Foto ${i + 1}">
        ${i === 0 ? '<span class="prod-capa">Capa</span>' : ""}
        <div class="prod-foto-acoes">
          <button type="button" data-foto="esq" data-i="${i}" aria-label="Mover para trás"${i === 0 ? " disabled" : ""}>‹</button>
          <button type="button" data-foto="rem" data-i="${i}" aria-label="Remover foto">✕</button>
          <button type="button" data-foto="dir" data-i="${i}" aria-label="Mover para frente"${i === ed.fotos.length - 1 ? " disabled" : ""}>›</button>
        </div>
      </div>`).join("") || '<p class="field-hint">Nenhuma foto ainda.</p>';
  }

  async function aoEscolherFotos(evento) {
    const arquivos = [...evento.target.files];
    evento.target.value = "";
    const status = $("f-fotos-status");
    for (let i = 0; i < arquivos.length; i++) {
      status.textContent = `Enviando foto ${i + 1} de ${arquivos.length}...`;
      try {
        const url = await enviarFoto(arquivos[i]);
        ed.fotos.push(url);
        ed.enviadas.push(url);
        desenharFotos();
      } catch (erro) {
        status.textContent = "Erro ao enviar foto: " + (erro.message || erro);
        return;
      }
    }
    status.textContent = arquivos.length ? "Fotos enviadas. Clique em Salvar para concluir." : "";
  }

  function erroForm(texto) {
    const el = $("f-erro");
    el.textContent = texto;
    el.hidden = !texto;
  }

  async function salvar(botao) {
    erroForm("");
    const nome = $("f-nome").value.trim();
    const preco = lerNumero($("f-preco").value);
    if (!nome) return erroForm("Informe o nome da peça.");
    if (preco === null) return erroForm("Informe um preço válido, por exemplo 129,90.");

    const dados = {
      nome, preco,
      categoria: $("f-categoria").value,
      ativo: $("f-ativo").checked,
      imagens: ed.fotos,
      updated_at: new Date().toISOString(),
    };
    TEXTOS.forEach((k) => (dados[k] = $("f-" + k).value.trim() || null));
    LISTAS.forEach((k) => (dados[k] = listaDeTexto($("f-" + k).value)));

    botao.disabled = true;
    botao.textContent = "Salvando...";
    let resp;
    if (ed.p) {
      resp = await db.from("produtos").update(dados).eq("id", ed.p.id).select();
    } else {
      Object.assign(dados, { id: gerarId(nome), ordem: proximaOrdem() });
      resp = await db.from("produtos").insert(dados).select();
    }
    botao.disabled = false;
    botao.textContent = "Salvar";
    if (resp.error || !resp.data || !resp.data.length) {
      return erroForm("Não foi possível salvar: " + (resp.error ? resp.error.message : "sua sessão pode ter expirado. Saia e entre de novo."));
    }
    await apagarFotos(ed.removidas.filter((u) => !ed.fotos.includes(u)));
    ed = null;
    fecharModal();
    aviso("Produto salvo. O site já está atualizado.");
    carregar();
  }

  async function excluir() {
    const p = ed.p;
    if (!confirm(`Excluir "${p.nome}" definitivamente?\n\nSe só quer tirar do site por um tempo, desmarque "Mostrar no site" e salve.`)) return;
    const { data, error } = await db.from("produtos").delete().eq("id", p.id).select();
    if (error || !data || !data.length) return erroForm("Não foi possível excluir: " + (error ? error.message : "sessão expirada?"));
    await apagarFotos([...(p.imagens || []), ...ed.enviadas]);
    ed = null;
    fecharModal();
    aviso("Produto excluído.");
    carregar();
  }

  async function cancelarEditor() {
    if (ed) await apagarFotos(ed.enviadas); // fotos enviadas nesta edição e não salvas
    ed = null;
    fecharModal();
  }

  function aoClicarModal(evento) {
    const b = evento.target.closest("[data-ed],[data-foto],[data-imp]");
    if (!b) return;
    if (b.dataset.ed === "salvar") salvar(b);
    if (b.dataset.ed === "cancelar") cancelarEditor();
    if (b.dataset.ed === "excluir") excluir();
    if (b.dataset.foto) {
      const i = Number(b.dataset.i);
      const f = ed.fotos;
      if (b.dataset.foto === "rem") ed.removidas.push(...f.splice(i, 1));
      if (b.dataset.foto === "esq" && i > 0) [f[i - 1], f[i]] = [f[i], f[i - 1]];
      if (b.dataset.foto === "dir" && i < f.length - 1) [f[i + 1], f[i]] = [f[i], f[i + 1]];
      desenharFotos();
    }
    if (b.dataset.imp === "cancelar") fecharModal();
  }

  // ---------- importar produtos que já estão no site (uma vez) ----------
  async function importarDoSite(botao) {
    botao.disabled = true;
    try {
      const lista = await (await fetch("data/produtos.json")).json();
      const agora = new Date().toISOString();
      const linhas = lista.map((p, i) => ({
        ...linhaVazia(),
        id: p.id, ordem: i + 1, ativo: true, categoria: p.categoria, nome: p.nome, preco: p.preco,
        material: p.material || null, descricao: p.descricao || null, codigo: p.codigo || null,
        largura: p.largura || null, cor: p.cor || null, formato: p.formato || null,
        acabamento: p.acabamento || null, pedra: p.pedra || null, detalhes: p.detalhes || null,
        tamanhos: p.tamanhos || null, tamanhos_feminino: p.tamanhosFeminino || null,
        tamanhos_masculino: p.tamanhosMasculino || null, variacoes: p.variacoes || null,
        imagens: p.imagens && p.imagens.length ? p.imagens : (p.imagem ? [p.imagem] : []),
        created_at: agora, updated_at: agora,
      }));
      const { error } = await db.from("produtos").upsert(linhas, { onConflict: "id" });
      if (error) throw error;
      aviso(`${linhas.length} produtos importados.`);
      carregar();
    } catch (erro) {
      aviso("Erro ao importar: " + (erro.message || erro), "erro");
    }
    botao.disabled = false;
  }

  // ---------- Excel ----------
  async function carregarXLSX() {
    if (window.XLSX) return window.XLSX;
    await new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = XLSX_URL;
      s.onload = ok;
      s.onerror = () => no(new Error("Não foi possível carregar o leitor de Excel. Verifique a internet."));
      document.head.appendChild(s);
    });
    return window.XLSX;
  }

  async function baixarPlanilha() {
    try {
      const X = await carregarXLSX();
      const linhas = produtos.map((p) => COLUNAS.map((c) => {
        if (c.k === "categoria") return CATEGORIAS[p.categoria] || p.categoria;
        if (c.k === "ativo") return p.ativo ? "Sim" : "Não";
        if (c.k === "preco") return Number(p.preco);
        if (LISTAS.includes(c.k)) return txtLista(p[c.k]);
        return p[c.k] ?? "";
      }));
      const ws = X.utils.aoa_to_sheet([COLUNAS.map((c) => c.t), ...linhas]);
      ws["!cols"] = COLUNAS.map((c) => ({ wch: c.w }));
      const colPreco = COLUNAS.findIndex((c) => c.k === "preco");
      linhas.forEach((_, i) => {
        const cel = ws[X.utils.encode_cell({ r: i + 1, c: colPreco })];
        if (cel) cel.z = "#,##0.00";
      });
      const ajuda = X.utils.aoa_to_sheet([
        ["Como usar esta planilha"],
        ["1. Altere o que quiser (preço, nome, descrição...). Célula vazia = mantém o que já está no site."],
        ["2. NÃO altere a coluna ID: é ela que identifica cada peça."],
        ["3. Para cadastrar uma peça nova, acrescente uma linha com o ID vazio e preencha Nome, Categoria e Preço."],
        ["4. Categoria: Anéis, Colares, Brincos ou Pulseiras. Mostrar no site: Sim ou Não."],
        ["5. Salve o arquivo e, na aba Produtos, clique em Importar planilha. Você verá uma prévia antes de aplicar."],
        ["6. Fotos não vão pela planilha: envie pela tela de cada peça."],
      ]);
      ajuda["!cols"] = [{ wch: 110 }];
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, "Produtos");
      X.utils.book_append_sheet(wb, ajuda, "Como usar");
      X.writeFile(wb, `produtos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (erro) {
      aviso(erro.message || String(erro), "erro");
    }
  }

  const CAT_ALIAS = { aneis: "aneis", anel: "aneis", colares: "colares", colar: "colares", brincos: "brincos", brinco: "brincos", pulseiras: "pulseiras", pulseira: "pulseiras" };

  function lerCelulas(get, mapa) {
    const valores = {}, erros = [];
    Object.keys(mapa).forEach((k) => {
      if (k === "id") return;
      const cru = get(k);
      if (String(cru).trim() === "") return; // vazio = mantém
      if (k === "categoria") {
        const c = CAT_ALIAS[norm(cru)];
        c ? (valores.categoria = c) : erros.push(`Categoria "${cru}" inválida (use Anéis, Colares, Brincos ou Pulseiras)`);
      } else if (k === "preco") {
        const n = lerNumero(cru);
        n === null ? erros.push(`Preço "${cru}" inválido`) : (valores.preco = n);
      } else if (k === "ativo") {
        const t = norm(cru);
        if (["sim", "s", "true", "1", "yes"].includes(t)) valores.ativo = true;
        else if (["nao", "n", "false", "0", "no"].includes(t)) valores.ativo = false;
        else erros.push(`"Mostrar no site" deve ser Sim ou Não (veio "${cru}")`);
      } else if (LISTAS.includes(k)) {
        valores[k] = listaDeTexto(cru);
      } else {
        valores[k] = String(cru).trim();
      }
    });
    return { valores, erros };
  }

  const igual = (k, a, b) => {
    if (LISTAS.includes(k)) return JSON.stringify(a || []) === JSON.stringify(b || []);
    if (k === "preco") return Number(a) === Number(b);
    if (k === "ativo") return !!a === !!b;
    return (a ?? "") === (b ?? "");
  };

  function analisar(linhas, mapa) {
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const usados = new Set();
    const r = { alterados: [], novos: [], erros: [], iguais: 0 };
    let ordem = proximaOrdem();
    for (let i = 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (l.every((c) => String(c).trim() === "")) continue;
      const get = (k) => (mapa[k] === undefined ? "" : l[mapa[k]]);
      const id = String(get("id")).trim();
      const { valores, erros } = lerCelulas(get, mapa);
      const ref = `Linha ${i + 1}`;
      if (id) {
        const atual = porId.get(id);
        if (!atual) { r.erros.push(`${ref}: o ID "${id}" não existe. Não altere a coluna ID.`); continue; }
        if (erros.length) { r.erros.push(`${ref} (${atual.nome}): ${erros.join("; ")}`); continue; }
        const mudancas = Object.keys(valores).filter((k) => !igual(k, atual[k], valores[k]))
          .map((k) => ({ k, de: atual[k], para: valores[k] }));
        if (!mudancas.length) { r.iguais++; continue; }
        const soMudou = Object.fromEntries(mudancas.map((m) => [m.k, m.para]));
        r.alterados.push({ atual, valores: soMudou, mudancas });
      } else {
        if (erros.length) { r.erros.push(`${ref}: ${erros.join("; ")}`); continue; }
        if (!valores.nome || !valores.categoria || valores.preco === undefined) {
          r.erros.push(`${ref}: para cadastrar peça nova preencha Nome, Categoria e Preço (e deixe o ID vazio).`);
          continue;
        }
        const novoId = gerarId(valores.nome, usados);
        usados.add(novoId);
        const agora = new Date().toISOString();
        r.novos.push({ ...linhaVazia(), ...valores, id: novoId, ordem: ordem++, ativo: valores.ativo ?? false, created_at: agora, updated_at: agora });
      }
    }
    return r;
  }

  function formatarValor(k, v) {
    if (k === "preco") return moeda(v);
    if (k === "ativo") return v ? "Sim" : "Não";
    if (k === "categoria") return CATEGORIAS[v] || v;
    if (LISTAS.includes(k)) return txtLista(v) || "(vazio)";
    const t = String(v ?? "");
    return t ? (t.length > 60 ? t.slice(0, 57) + "..." : t) : "(vazio)";
  }

  let pendente = null;

  async function aoEscolherPlanilha(evento) {
    const arquivo = evento.target.files[0];
    evento.target.value = "";
    if (!arquivo) return;
    try {
      const X = await carregarXLSX();
      const wb = X.read(await arquivo.arrayBuffer(), { type: "array" });
      const linhas = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
      if (!linhas.length) throw new Error("A planilha está vazia.");
      const cab = linhas[0].map(norm);
      const mapa = {};
      COLUNAS.forEach((c) => {
        const i = cab.findIndex((h) => h === norm(c.t) || h === c.k);
        if (i >= 0) mapa[c.k] = i;
      });
      if (mapa.id === undefined) throw new Error('Não encontrei a coluna "ID". Use a planilha baixada pelo botão "Baixar planilha".');
      pendente = analisar(linhas, mapa);
      mostrarPrevia(pendente);
    } catch (erro) {
      aviso("Erro ao ler a planilha: " + (erro.message || erro), "erro");
    }
  }

  function mostrarPrevia(r) {
    const total = r.alterados.length + r.novos.length;
    const alterados = r.alterados.map((a) => `<li><strong>${esc(a.atual.nome)}</strong><br>${a.mudancas.map((m) =>
      `${esc(ROTULO[m.k])}: ${esc(formatarValor(m.k, m.de))} → <b>${esc(formatarValor(m.k, m.para))}</b>`).join("<br>")}</li>`).join("");
    const novos = r.novos.map((n) => `<li><strong>${esc(n.nome)}</strong> · ${esc(CATEGORIAS[n.categoria])} · ${moeda(n.preco)}${n.ativo ? "" : " · <em>ficará oculto até você marcar Sim em “Mostrar no site”</em>"}</li>`).join("");
    const erros = r.erros.map((e) => `<li>${esc(e)}</li>`).join("");
    abrirModal(`
      <h2>Prévia da importação</h2>
      <p>${r.alterados.length} para alterar · ${r.novos.length} novo(s) · ${r.iguais} sem mudança · ${r.erros.length} com problema</p>
      ${r.alterados.length ? `<h3>Alterações</h3><ul class="imp-lista">${alterados}</ul>` : ""}
      ${r.novos.length ? `<h3>Novos produtos</h3><p class="field-hint">Ficam sem foto até você enviar pela tela da peça.</p><ul class="imp-lista">${novos}</ul>` : ""}
      ${r.erros.length ? `<h3>Linhas ignoradas</h3><ul class="imp-lista erro">${erros}</ul>` : ""}
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="imp-aplicar"${total ? "" : " disabled"}>Aplicar ${total ? total + " alteração(ões)" : ""}</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    $("imp-aplicar").addEventListener("click", aplicarPlanilha);
  }

  async function aplicarPlanilha(evento) {
    const botao = evento.currentTarget;
    botao.disabled = true;
    botao.textContent = "Aplicando...";
    const agora = new Date().toISOString();
    const linhas = [
      ...pendente.alterados.map((a) => ({ ...a.atual, ...a.valores, updated_at: agora })),
      ...pendente.novos,
    ];
    for (let i = 0; i < linhas.length; i += 100) {
      const { error } = await db.from("produtos").upsert(linhas.slice(i, i + 100), { onConflict: "id" });
      if (error) {
        botao.disabled = false;
        botao.textContent = "Tentar de novo";
        const el = $("f-erro");
        el.textContent = "Erro ao gravar: " + error.message;
        el.hidden = false;
        return;
      }
    }
    fecharModal();
    aviso(`Pronto: ${pendente.alterados.length} atualizado(s), ${pendente.novos.length} novo(s). O site já está atualizado.`);
    pendente = null;
    carregar();
  }

  // Estilos da aba (injetados aqui para o painel não depender de outro arquivo).
  const ESTILO = `
/* Linha embaixo do título (mesma espessura da linha do menu) e fundo do modo escuro */
.gestao-header { border-bottom: 3px solid #000; }
[data-theme="dark"] .gestao-header { border-bottom-color: #fff; }
[data-theme="dark"] body { background: #000; }
[data-theme="dark"] .prod-modal-caixa { background: #000; }

.gestao-topo { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: var(--line); }
.gestao-abas { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface); border: var(--line); border-radius: 999px; }
.gestao-aba {
  border: 0; background: transparent; color: var(--ink);
  padding: 0.6em 1.6em; border-radius: 999px;
  font-family: var(--font-body); font-size: 0.95rem; cursor: pointer;
  transition: background 0.2s ease;
}
.gestao-aba:hover { background: var(--gold-light); }
.gestao-aba.active { background: var(--btn-primary-bg); color: var(--bone); font-weight: 500; box-shadow: inset 0 0 0 2px #000; }
#btn-sair { padding: 0.6em 1.5em; background: transparent; border: 1px solid var(--gold-dim); color: var(--ink); }
#btn-sair:hover { background: var(--gold-light); }

#aba-pedidos[hidden], #aba-produtos[hidden], .prod-modal[hidden], .prod-msg[hidden], .prod-vazio[hidden] { display: none !important; }

.prod-barra { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
.prod-busca {
  flex: 1 1 260px; min-width: 0; box-sizing: border-box; height: 44px;
  padding: 0 1.1em; border-radius: 999px;
  border: 1px solid var(--gold-dim); background: var(--surface); color: var(--ink);
  font-family: var(--font-body); font-size: 0.92rem;
}
.prod-busca::placeholder { color: var(--muted); }
.prod-acoes { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.prod-acoes .btn { height: 44px; padding: 0 1.3em; font-size: 0.88rem; white-space: nowrap; box-sizing: border-box; }

.prod-msg { padding: 0.75em 1em; border-radius: var(--radius-s); margin: 0 0 1.25rem; font-size: 0.9rem; }
.prod-msg.ok { background: #dfeee0; color: #2f6b3a; }
.prod-msg.erro { background: var(--rose-light); color: var(--rose); }
.prod-vazio {
  display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center;
  background: var(--surface); border: var(--line); border-radius: var(--radius-m);
  padding: var(--space-4) var(--space-3); margin-bottom: 1.25rem;
}
.prod-vazio p { margin: 0; max-width: 460px; }

.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: var(--space-2); }
.prod-card {
  display: flex; gap: 0.9rem; align-items: center;
  background: var(--surface); border: 1px solid var(--bone-2); border-radius: var(--radius-m);
  padding: 0.75rem; cursor: pointer; transition: border-color 0.2s ease, transform 0.15s ease;
}
.prod-card:hover, .prod-card:focus-visible { border-color: var(--gold-dim); outline: none; transform: translateY(-1px); }
.prod-card.oculto { opacity: 0.6; }
.prod-thumb { flex: 0 0 72px; height: 72px; border-radius: 50%; overflow: hidden; background: var(--bone-2); border: 2px solid var(--medallion-gold); }
.prod-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.prod-info { min-width: 0; }
.prod-info h3 { font-size: 1rem; margin: 0 0 0.25em; }
.prod-sub { margin: 0; font-size: 0.82rem; color: var(--muted); }

.prod-modal {
  position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, 0.55);
  overflow-y: auto; display: flex; justify-content: center; align-items: flex-start; padding: 1.5rem 1rem;
}
.prod-modal-caixa {
  width: 100%; max-width: 640px; box-sizing: border-box;
  background: var(--page-bg); color: var(--ink);
  border: var(--line); border-radius: var(--radius-m); padding: var(--space-3);
}
.prod-modal-caixa h2 { margin-top: 0; }
.prod-modal-caixa h3 { font-size: 1.05rem; margin: 1rem 0 0.4rem; }
.prod-modal-caixa h3 small { font-weight: 400; color: var(--muted); font-size: 0.8rem; }
.prod-mais { margin-bottom: 1rem; }
.prod-mais summary { cursor: pointer; margin-bottom: 0.75rem; color: var(--gold-dim); }
.prod-check { display: flex; align-items: center; gap: 0.5em; margin: 0.5rem 0 1rem; cursor: pointer; }

.prod-fotos { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.prod-foto { position: relative; width: 104px; }
.prod-foto img { width: 104px; height: 104px; object-fit: cover; border-radius: var(--radius-s); border: 1px solid var(--bone-2); display: block; }
.prod-capa { position: absolute; top: 4px; left: 4px; background: var(--btn-primary-bg); color: var(--bone); font-size: 0.7rem; padding: 0.1em 0.6em; border-radius: 999px; }
.prod-foto-acoes { display: flex; justify-content: space-between; margin-top: 4px; }
.prod-foto-acoes button {
  width: 30px; height: 30px; border-radius: 50%; padding: 0;
  border: 1px solid var(--gold-dim); background: var(--surface); color: var(--ink);
  cursor: pointer; font-size: 0.9rem; line-height: 1;
}
.prod-foto-acoes button:disabled { opacity: 0.3; cursor: default; }
.prod-add-foto { cursor: pointer; }

.prod-botoes { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1.25rem; }
.prod-botoes .btn { padding: 0.7em 1.5em; }
.prod-botoes .btn-danger { margin-left: auto; }

.imp-lista { list-style: none; padding: 0; margin: 0 0 0.5rem; max-height: 240px; overflow-y: auto; font-size: 0.88rem; }
.imp-lista li { padding: 0.45em 0; border-bottom: 1px solid var(--bone-2); }
.imp-lista.erro li { color: var(--rose); }

@media (max-width: 600px) {
  .gestao-topo { flex-wrap: nowrap; }
  .gestao-aba { padding: 0.55em 1.1em; }
  .prod-acoes { width: 100%; }
  .prod-acoes .btn { flex: 1 1 calc(50% - 0.5rem); }
  #prod-novo { flex-basis: 100%; }
  .prod-modal { padding: 0; }
  .prod-modal-caixa { border-radius: 0; min-height: 100%; }
}
`;

  function injetarEstilo() {
    if (document.getElementById("gestao-produtos-css")) return;
    const el = document.createElement("style");
    el.id = "gestao-produtos-css";
    el.textContent = ESTILO;
    document.head.appendChild(el);
  }

  // ---------- abas e inicialização ----------
  function trocarAba(nome) {
    document.querySelectorAll(".gestao-aba").forEach((b) => b.classList.toggle("active", b.dataset.aba === nome));
    $("aba-pedidos").hidden = nome !== "pedidos";
    $("aba-produtos").hidden = nome !== "produtos";
    if (nome === "produtos") carregar();
  }

  function iniciar() {
    if (!$("aba-produtos")) return;
    document.querySelectorAll(".gestao-aba").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));
    $("prod-busca").addEventListener("input", desenhar);
    $("prod-novo").addEventListener("click", () => abrirEditor(null));
    $("prod-baixar").addEventListener("click", baixarPlanilha);
    $("prod-importar").addEventListener("click", () => $("prod-arquivo").click());
    $("prod-arquivo").addEventListener("change", aoEscolherPlanilha);
    $("prod-importar-site").addEventListener("click", (e) => importarDoSite(e.currentTarget));
    $("prod-lista").addEventListener("click", (e) => {
      const card = e.target.closest(".prod-card");
      if (card) abrirEditor(produtos.find((p) => p.id === card.dataset.id));
    });
    $("prod-lista").addEventListener("keydown", (e) => {
      const card = e.target.closest(".prod-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirEditor(produtos.find((p) => p.id === card.dataset.id)); }
    });
    $("prod-modal-corpo").addEventListener("click", aoClicarModal);
    $("prod-modal-corpo").addEventListener("change", (e) => { if (e.target.id === "f-fotos") aoEscolherFotos(e); });
  }

  injetarEstilo();
  document.addEventListener("DOMContentLoaded", iniciar);
})();
