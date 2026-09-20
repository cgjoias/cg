// ============================================================
// ABA "PRODUTOS" DA GESTÃO
// Cadastro, edição, fotos e planilha Excel dos produtos.
// Usa o mesmo login da aba Pedidos (Supabase Auth). Só quem está
// logado consegue gravar (regras RLS em schema-produtos.sql).
// ============================================================
(function () {
  const VERSAO_PAINEL = "20260920u";
  const BUCKET = "produtos";
  const CATEGORIAS = { aliancas: "Alianças", aneis: "Anéis", colares: "Colares", brincos: "Brincos", pulseiras: "Pulseiras" };
  const TEXTOS = ["material", "descricao", "codigo", "cor", "pedra", "largura", "formato", "acabamento", "detalhes"];
  const LISTAS = ["tamanhos", "tamanhos_feminino", "tamanhos_masculino"];
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
  const JSZIP_URL_RESERVA = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  // Colunas da planilha (k = coluna no banco, t = título no Excel)
  const COLUNAS = [
    { k: "id", t: "ID (não alterar)", w: 30 },
    { k: "nome", t: "Nome", w: 34 },
    { k: "categoria", t: "Categoria", w: 12 },
    { k: "material", t: "Material", w: 22 },
    { k: "preco", t: "Preço", w: 10 },
    { k: "preco_par", t: "Preço par", w: 10 },
    { k: "preco_unidade", t: "Preço unidade", w: 12 },
    { k: "preco_trio", t: "Preço trio", w: 10 },
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
  ROTULO.foto = "Foto";
  ROTULO.precos = "Valores (par / unidade / trio)";

  // Valores por tipo de venda. Alianças têm 3: Par, Unidade e Trio. Ficam no banco na coluna
  // "precos" como [{ rotulo: "Par", valor: 60 }, ...]; o "preco" da peça vira o da primeira opção.
  const TIPOS_PRECO = [
    { k: "preco_par", r: "Par" },
    { k: "preco_unidade", r: "Unidade" },
    { k: "preco_trio", r: "Trio" },
  ];
  const ehTipoPreco = (k) => TIPOS_PRECO.some((t) => t.k === k);

  let produtos = [];
  let ed = null; // estado do editor aberto

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const moeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const txtLista = (v) => (Array.isArray(v) ? v.join(", ") : "");
  const listaPrecos = (v) => (Array.isArray(v) ? v.filter((o) => o && o.rotulo && Number(o.valor) > 0) : []);
  const textoPrecos = (v) => listaPrecos(v).map((o) => `${o.rotulo} ${moeda(o.valor)}`).join(" · ");
  const precoDoTipo = (p, rotulo) => {
    const o = listaPrecos(p && p.precos).find((x) => norm(x.rotulo) === norm(rotulo));
    return o ? Number(o.valor) : null;
  };
  const precosIguais = (a, b) => JSON.stringify(listaPrecos(a).map((o) => [norm(o.rotulo), Number(o.valor)])) === JSON.stringify(listaPrecos(b).map((o) => [norm(o.rotulo), Number(o.valor)]));

  // Mensagem amigável quando o banco ainda não tem a coluna "precos".
  function msgErroBanco(msg) {
    return /precos/i.test(String(msg || ""))
      ? String(msg) + " — falta rodar o arquivo migracao-valores-por-tipo.sql no Supabase (SQL Editor). É só uma vez."
      : String(msg || "");
  }

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
    const o = { id: null, ordem: 0, ativo: true, categoria: "aliancas", nome: "", preco: 0, imagens: [], variacoes: null };
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
      return `<article class="prod-card${p.ativo ? " confirmado" : " oculto"}" data-id="${esc(p.id)}" tabindex="0" role="button">
        <div class="prod-thumb"><img src="${esc(foto)}" alt="" loading="lazy"></div>
        <div class="prod-info">
          <h3>${esc(p.nome)}</h3>
          <p class="prod-sub">${esc(CATEGORIAS[p.categoria] || p.categoria)} · ${esc(listaPrecos(p.precos).length ? textoPrecos(p.precos) : moeda(p.preco))}</p>
          <p class="prod-sub">${(p.imagens || []).length} foto(s) · ${p.ativo ? '<span class="status-tag status-confirmado">✓ Confirmado</span>' : '<span class="status-tag status-pendente">Aguardando confirmação</span>'}</p>
          <button type="button" class="prod-conf" data-conf="${esc(p.id)}">${p.ativo ? "Desfazer confirmação" : "✓ Confirmar"}</button>
        </div>
      </article>`;
    }).join("") || (produtos.length ? "<p>Nenhuma peça encontrada.</p>" : "");
    atualizarBotaoConfirmarTudo();
  }

  function atualizarBotaoConfirmarTudo() {
    const b = $("prod-confirmar-tudo");
    if (!b) return;
    const aguardando = produtos.filter((p) => !p.ativo).length;
    b.textContent = aguardando ? `Confirmar tudo (${aguardando})` : "Confirmar tudo";
    b.disabled = !aguardando;
  }

  // ---------- confirmar (= "Mostrar no site") ----------
  // Peça confirmada aparece no site e fica com a borda preta aqui no painel.
  // Peça aguardando confirmação fica oculta do site (é como as importações da planilha chegam).
  async function alternarConfirmacao(id) {
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    const novo = !p.ativo;
    if (novo && !(Number(p.preco) > 0) && !confirm(`"${p.nome}" está com preço R$ 0,00 e vai aparecer assim no site. Confirmar mesmo assim?`)) return;
    const { data, error } = await db.from("produtos").update({ ativo: novo, updated_at: new Date().toISOString() }).eq("id", id).select();
    if (error || !data || !data.length) {
      aviso("Não foi possível alterar: " + (error ? error.message : "sua sessão pode ter expirado. Saia e entre de novo."), "erro");
      return;
    }
    p.ativo = novo;
    desenhar();
  }

  async function verConfirmarTudo() {
    await carregar();
    const aguardando = produtos.filter((p) => !p.ativo);
    if (!aguardando.length) { aviso("Não há nada aguardando confirmação: todas as peças já estão confirmadas."); return; }
    const semPreco = aguardando.filter((p) => !(Number(p.preco) > 0));
    abrirModal(`
      <h2>Confirmar tudo</h2>
      <p><strong>${aguardando.length}</strong> peça(s) aguardando confirmação. Confirmar publica a peça no site e deixa a borda do card preta.</p>
      ${semPreco.length ? `<p><strong>${semPreco.length}</strong> delas estão com preço <strong>R$ 0,00</strong> e apareceriam assim no site.</p>
        <label class="prod-check"><input type="checkbox" id="conf-zerados"> Confirmar também as peças com R$ 0,00</label>` : ""}
      <p id="conf-resumo"></p>
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="conf-aplicar">Confirmar</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    const alvo = () => ($("conf-zerados") && $("conf-zerados").checked ? aguardando : aguardando.filter((p) => Number(p.preco) > 0));
    const atualizar = () => {
      const n = alvo().length;
      $("conf-resumo").textContent = n ? `Serão confirmadas ${n} peça(s).` : "Nenhuma peça com preço para confirmar. Preencha os preços (pela planilha baixada ou peça por peça) ou marque a opção acima.";
      $("conf-aplicar").textContent = n ? `Confirmar ${n} peça(s)` : "Confirmar";
      $("conf-aplicar").disabled = !n;
    };
    if ($("conf-zerados")) $("conf-zerados").addEventListener("change", atualizar);
    $("conf-aplicar").addEventListener("click", (e) => confirmarLote(e.currentTarget, alvo()));
    atualizar();
  }

  async function confirmarLote(botao, lista) {
    botao.disabled = true;
    botao.textContent = "Confirmando...";
    const ids = lista.map((p) => p.id);
    let feitas = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("produtos").update({ ativo: true, updated_at: new Date().toISOString() }).in("id", ids.slice(i, i + 100)).select();
      if (error) {
        botao.disabled = false;
        botao.textContent = "Tentar de novo";
        const el = $("f-erro");
        el.textContent = "Erro ao confirmar: " + error.message;
        el.hidden = false;
        carregar();
        return;
      }
      feitas += (data || []).length;
    }
    if (ids.length && !feitas) {
      botao.disabled = false;
      botao.textContent = "Tentar de novo";
      const el = $("f-erro");
      el.textContent = "Nada foi confirmado — sua sessão pode ter expirado. Saia e entre de novo.";
      el.hidden = false;
      return;
    }
    fecharModal();
    aviso(`Pronto: ${feitas} peça(s) confirmada(s). O site já está atualizado.`);
    carregar();
  }

  // ---------- editor ----------
  const campo = (id, rotulo, valor, extra) =>
    `<div class="field"><label for="f-${id}">${rotulo}</label><input type="text" id="f-${id}" value="${esc(valor)}" ${extra || ""}></div>`;

  function abrirEditor(p) {
    ed = { p, fotos: p ? [...(p.imagens || [])] : [], enviadas: [], removidas: [] };
    const v = p || { ativo: true, categoria: "aliancas", preco: "" };
    const opcoes = Object.entries(CATEGORIAS).map(([k, n]) => `<option value="${k}"${v.categoria === k ? " selected" : ""}>${n}</option>`).join("");
    abrirModal(`
      <h2>${p ? "Editar peça" : "Novo produto"}</h2>
      ${campo("nome", "Nome *", v.nome)}
      <div class="field-row">
        <div class="field"><label for="f-categoria">Categoria *</label><select id="f-categoria">${opcoes}</select></div>
        ${campo("preco", "Preço (R$) *", p ? String(v.preco).replace(".", ",") : "", 'inputmode="decimal" placeholder="129,90"')}
      </div>
      <details class="prod-mais"${listaPrecos(v.precos).length ? " open" : ""}>
        <summary>Valores por tipo de venda — Par / Unidade / Trio (alianças)</summary>
        <p class="field-hint">Preencha só se a peça tem valores diferentes por tipo. No site, o cliente escolhe Par, Unidade ou Trio. Se usar isto, o campo Preço acima passa a valer o do primeiro tipo preenchido. Deixe tudo vazio para usar um preço único.</p>
        <div class="field-row">
          ${campo("preco_par", "Par (R$)", precoDoTipo(v, "Par") != null ? String(precoDoTipo(v, "Par")).replace(".", ",") : "", 'inputmode="decimal" placeholder="60,00"')}
          ${campo("preco_unidade", "Unidade (R$)", precoDoTipo(v, "Unidade") != null ? String(precoDoTipo(v, "Unidade")).replace(".", ",") : "", 'inputmode="decimal" placeholder="45,00"')}
        </div>
        <div class="field-row">
          ${campo("preco_trio", "Trio (R$)", precoDoTipo(v, "Trio") != null ? String(precoDoTipo(v, "Trio")).replace(".", ",") : "", 'inputmode="decimal" placeholder="85,00"')}
        </div>
      </details>
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
    let preco = lerNumero($("f-preco").value);
    if (!nome) return erroForm("Informe o nome da peça.");
    const precos = [];
    for (const t of TIPOS_PRECO) {
      const cru = $("f-" + t.k).value.trim();
      if (!cru) continue;
      const n = lerNumero(cru);
      if (n === null || n <= 0) return erroForm(`Valor de "${t.r}" inválido. Use um número, por exemplo 60,00.`);
      precos.push({ rotulo: t.r, valor: n });
    }
    if (precos.length) preco = precos[0].valor;
    else if (preco === null) return erroForm("Informe um preço válido, por exemplo 129,90.");

    const dados = {
      nome, preco,
      categoria: $("f-categoria").value,
      ativo: $("f-ativo").checked,
      imagens: ed.fotos,
      updated_at: new Date().toISOString(),
    };
    TEXTOS.forEach((k) => (dados[k] = $("f-" + k).value.trim() || null));
    LISTAS.forEach((k) => (dados[k] = listaDeTexto($("f-" + k).value)));
    // Só manda "precos" quando há o que gravar (ou limpar), para não exigir a coluna nova de quem não usa.
    if (precos.length) dados.precos = precos;
    else if (ed.p && listaPrecos(ed.p.precos).length) dados.precos = null;

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
      return erroForm("Não foi possível salvar: " + (resp.error ? msgErroBanco(resp.error.message) : "sua sessão pode ter expirado. Saia e entre de novo."));
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
    if (b.dataset.imp === "cancelar") { imagensPendentes = null; financeiroPendente = null; fecharModal(); }
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

  // ---------- remover cópias repetidas ----------
  // Peças com o mesmo código + mesmo nome são a mesma peça importada mais de uma vez.
  // Mantém 1 de cada (a que tem preço, está visível, tem foto e é a mais antiga) e apaga
  // as outras — passando pra que a mantida fique com a foto de uma cópia, se ela não tinha.
  function achaDuplicados() {
    const pontos = (p) => (Number(p.preco) > 0 ? 4 : 0) + (p.ativo ? 2 : 0) + ((p.imagens || []).length ? 1 : 0);
    const grupos = new Map();
    produtos.forEach((p) => {
      if (!norm(p.codigo)) return; // sem código não dá pra ter certeza: não mexe
      const chave = norm(p.codigo) + "|" + norm(p.nome);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(p);
    });
    const resultado = [];
    grupos.forEach((lista) => {
      if (lista.length < 2) return;
      const ordenada = [...lista].sort((a, b) => pontos(b) - pontos(a) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
      const [manter, ...apagar] = ordenada;
      let fotoAdotada = null;
      if (!(manter.imagens || []).length) {
        const comFoto = apagar.find((x) => (x.imagens || []).length);
        if (comFoto) fotoAdotada = comFoto.imagens;
      }
      resultado.push({ manter, apagar, fotoAdotada });
    });
    return resultado;
  }

  async function verDuplicados() {
    await carregar();
    const grupos = achaDuplicados();
    const total = grupos.reduce((n, g) => n + g.apagar.length, 0);
    if (!total) {
      aviso("Não encontrei peças repetidas (mesmo código e mesmo nome).");
      return;
    }
    const itens = grupos.slice(0, 40).map((g) =>
      `<li><strong>${esc(g.manter.nome)}</strong> (${esc(g.manter.codigo)}) — ${g.apagar.length + 1} cópias, mantém 1 e apaga ${g.apagar.length}</li>`).join("");
    abrirModal(`
      <h2>Remover peças repetidas</h2>
      <p>${grupos.length} peça(s) aparecem mais de uma vez. Vou manter 1 de cada e apagar <strong>${total}</strong> cópia(s) (e as fotos delas). Em cada grupo fica a cópia que tem preço, está visível e tem foto; se empatar, a mais antiga.</p>
      <ul class="imp-lista">${itens}${grupos.length > 40 ? `<li>...e mais ${grupos.length - 40} peça(s)</li>` : ""}</ul>
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="dup-aplicar">Apagar ${total} cópia(s)</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    $("dup-aplicar").addEventListener("click", (e) => removerDuplicados(e.currentTarget, grupos));
  }

  async function removerDuplicados(botao, grupos) {
    botao.disabled = true;
    botao.textContent = "Apagando...";
    const erroTela = (t) => { botao.disabled = false; botao.textContent = "Tentar de novo"; const el = $("f-erro"); el.textContent = t; el.hidden = false; };
    // 1) a peça mantida herda a foto de uma cópia, se ela não tinha nenhuma
    for (const g of grupos.filter((x) => x.fotoAdotada)) {
      const { error } = await db.from("produtos").update({ imagens: g.fotoAdotada, updated_at: new Date().toISOString() }).eq("id", g.manter.id);
      if (error) return erroTela("Erro ao passar a foto: " + error.message);
    }
    // 2) apaga as cópias
    const ids = grupos.flatMap((g) => g.apagar.map((x) => x.id));
    let apagadas = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("produtos").delete().in("id", ids.slice(i, i + 100)).select();
      if (error) return erroTela("Erro ao apagar: " + error.message);
      apagadas += (data || []).length;
    }
    if (!apagadas && ids.length) return erroTela("Nada foi apagado — sua sessão pode ter expirado. Saia e entre de novo.");
    // 3) apaga do Storage as fotos das cópias (menos as que a peça mantida adotou)
    const adotadas = new Set(grupos.flatMap((g) => g.fotoAdotada || []));
    const fotosSoltas = grupos.flatMap((g) => g.apagar.flatMap((x) => x.imagens || [])).filter((u) => !adotadas.has(u));
    await apagarFotos(fotosSoltas);
    fecharModal();
    aviso(`Pronto: ${apagadas} cópia(s) repetida(s) apagada(s). Ficou 1 de cada peça.`);
    carregar();
  }

  // ---------- apagar tudo (recomeçar do zero) ----------
  // Apaga todos os produtos do painel e as fotos deles no Storage. Por padrão mantém os
  // produtos originais do site (os de data/produtos.json), pra você poder limpar só o que
  // veio das importações de planilha. Pede pra digitar APAGAR antes.
  async function verApagarTudo() {
    await carregar();
    if (!produtos.length) { aviso("Não há nenhum produto para apagar."); return; }
    let originais = null;
    try { originais = new Set((await (await fetch("data/produtos.json")).json()).map((p) => p.id)); } catch (e) { /* segue sem proteção */ }
    const nOrig = originais ? produtos.filter((p) => originais.has(p.id)).length : 0;
    abrirModal(`
      <h2>Excluir produtos</h2>
      <p>Hoje o painel tem <strong>${produtos.length}</strong> produto(s). Apagar é definitivo (as fotos enviadas também somem).</p>
      ${originais
        ? `<label class="prod-check"><input type="checkbox" id="apagar-manter" checked> Manter os ${nOrig} produto(s) originais do site (o que não veio de planilha)</label>`
        : `<p class="prod-msg erro">Não consegui ler o data/produtos.json, então não dá pra separar os originais: <strong>tudo</strong> será apagado.</p>`}
      <p id="apagar-resumo"></p>
      <div class="field"><label for="apagar-confirma">Para confirmar, digite APAGAR</label><input type="text" id="apagar-confirma" autocomplete="off"></div>
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="apagar-aplicar" disabled>Apagar</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    const alvo = () => ($("apagar-manter") && $("apagar-manter").checked ? produtos.filter((p) => !originais.has(p.id)) : produtos);
    const atualizar = () => {
      const n = alvo().length;
      $("apagar-resumo").textContent = n ? `Serão apagados ${n} produto(s).` : "Não sobra nada para apagar com essa opção.";
      $("apagar-aplicar").textContent = n ? `Apagar ${n} produto(s)` : "Apagar";
      $("apagar-aplicar").disabled = !n || $("apagar-confirma").value.trim().toUpperCase() !== "APAGAR";
    };
    $("apagar-confirma").addEventListener("input", atualizar);
    if ($("apagar-manter")) $("apagar-manter").addEventListener("change", atualizar);
    $("apagar-aplicar").addEventListener("click", (e) => apagarTudo(e.currentTarget, alvo()));
    atualizar();
  }

  async function apagarTudo(botao, lista) {
    botao.disabled = true;
    botao.textContent = "Apagando...";
    const erroTela = (t) => { botao.disabled = false; botao.textContent = "Tentar de novo"; const el = $("f-erro"); el.textContent = t; el.hidden = false; };
    const ids = lista.map((p) => p.id);
    let apagados = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("produtos").delete().in("id", ids.slice(i, i + 100)).select();
      if (error) return erroTela("Erro ao apagar: " + error.message);
      apagados += (data || []).length;
    }
    if (ids.length && !apagados) return erroTela("Nada foi apagado — sua sessão pode ter expirado. Saia e entre de novo.");
    const fotos = lista.flatMap((p) => p.imagens || []);
    for (let i = 0; i < fotos.length; i += 100) await apagarFotos(fotos.slice(i, i + 100));
    fecharModal();
    aviso(`Pronto: ${apagados} produto(s) apagado(s).`);
    carregar();
  }

  // ---------- Valores das alianças (Par / Unidade / Trio) direto no painel ----------
  // Atalho que não depende da planilha: aplica os 3 valores em TODAS as peças cujo nome
  // começa com "Aliança" e já as coloca na categoria Alianças. Serve também para mudar
  // o valor depois (é só abrir de novo, digitar e aplicar).
  const ehAlianca = (p) => /^alian[cç]a/i.test(norm(p.nome));

  async function verValoresAliancas() {
    await carregar();
    const alvo = produtos.filter(ehAlianca);
    if (!alvo.length) { aviso("Não achei nenhuma peça com nome começando por ALIANÇA.", "erro"); return; }
    const atual = (r) => { const a = alvo.find((p) => precoDoTipo(p, r) != null); return a ? String(precoDoTipo(a, r)).replace(".", ",") : ""; };
    abrirModal(`
      <h2>Valores das alianças</h2>
      <p><strong>${alvo.length}</strong> peça(s) cujo nome começa com ALIANÇA vão receber estes três valores e ir para a categoria <strong>Alianças</strong>. O cliente escolhe Par, Unidade ou Trio no site.</p>
      <div class="field-row">
        ${campo("va_par", "Par (R$)", atual("Par") || "60", 'inputmode="decimal"')}
        ${campo("va_unidade", "Unidade (R$)", atual("Unidade") || "45", 'inputmode="decimal"')}
      </div>
      <div class="field-row">${campo("va_trio", "Trio (R$)", atual("Trio") || "85", 'inputmode="decimal"')}</div>
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="va-aplicar">Aplicar em ${alvo.length} peça(s)</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    $("va-aplicar").addEventListener("click", (e) => aplicarValoresAliancas(e.currentTarget, alvo));
  }

  async function aplicarValoresAliancas(botao, alvo) {
    erroForm("");
    const precos = [];
    for (const [id, r] of [["va_par", "Par"], ["va_unidade", "Unidade"], ["va_trio", "Trio"]]) {
      const n = lerNumero($("f-" + id).value);
      if (n === null || n <= 0) return erroForm(`Informe um valor válido para "${r}", por exemplo 60,00.`);
      precos.push({ rotulo: r, valor: n });
    }
    botao.disabled = true;
    botao.textContent = "Aplicando...";
    const ids = alvo.map((p) => p.id);
    let feitas = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const { data, error } = await db.from("produtos")
        .update({ precos, preco: precos[0].valor, categoria: "aliancas", updated_at: new Date().toISOString() })
        .in("id", ids.slice(i, i + 50)).select();
      if (error) {
        botao.disabled = false;
        botao.textContent = "Tentar de novo";
        return erroForm("Erro ao gravar: " + msgErroBanco(error.message));
      }
      feitas += (data || []).length;
    }
    if (!feitas) {
      botao.disabled = false;
      botao.textContent = "Tentar de novo";
      return erroForm("Nada foi alterado — sua sessão pode ter expirado. Saia e entre de novo.");
    }
    fecharModal();
    aviso(`Pronto: ${feitas} aliança(s) com Par ${moeda(precos[0].valor)}, Unidade ${moeda(precos[1].valor)} e Trio ${moeda(precos[2].valor)}, na categoria Alianças.`);
    carregar();
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
        if (ehTipoPreco(c.k)) return precoDoTipo(p, TIPOS_PRECO.find((t) => t.k === c.k).r) ?? "";
        if (LISTAS.includes(c.k)) return txtLista(p[c.k]);
        return p[c.k] ?? "";
      }));
      const ws = X.utils.aoa_to_sheet([COLUNAS.map((c) => c.t), ...linhas]);
      ws["!cols"] = COLUNAS.map((c) => ({ wch: c.w }));
      const colsPreco = COLUNAS.map((c, i) => (c.k === "preco" || ehTipoPreco(c.k) ? i : -1)).filter((i) => i >= 0);
      linhas.forEach((_, i) => colsPreco.forEach((col) => {
        const cel = ws[X.utils.encode_cell({ r: i + 1, c: col })];
        if (cel) cel.z = "#,##0.00";
      }));
      const ajuda = X.utils.aoa_to_sheet([
        ["Como usar esta planilha"],
        ["1. Altere o que quiser (preço, nome, descrição...). Célula vazia = mantém o que já está no site."],
        ["2. NÃO altere a coluna ID: é ela que identifica cada peça."],
        ["3. Para cadastrar uma peça nova, acrescente uma linha com o ID vazio e preencha Nome, Categoria e Preço."],
        ["4. Categoria: Alianças, Anéis, Colares, Brincos ou Pulseiras. Mostrar no site: Sim ou Não."],
        ["   Alianças com valores por tipo: preencha Preço par, Preço unidade e Preço trio (o cliente escolhe no site). Vazio = mantém. Nessas linhas, a coluna Preço passa a valer o do par."],
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

  const CAT_ALIAS = { aliancas: "aliancas", alianca: "aliancas", aneis: "aneis", anel: "aneis", colares: "colares", colar: "colares", brincos: "brincos", brinco: "brincos", pulseiras: "pulseiras", pulseira: "pulseiras" };

  function lerCelulas(get, mapa) {
    const valores = {}, erros = [];
    Object.keys(mapa).forEach((k) => {
      if (k === "id") return;
      const cru = get(k);
      if (String(cru).trim() === "") return; // vazio = mantém
      if (k === "categoria") {
        const c = CAT_ALIAS[norm(cru)];
        c ? (valores.categoria = c) : erros.push(`Categoria "${cru}" inválida (use Alianças, Anéis, Colares, Brincos ou Pulseiras)`);
      } else if (k === "preco") {
        const n = lerNumero(cru);
        n === null ? erros.push(`Preço "${cru}" inválido`) : (valores.preco = n);
      } else if (ehTipoPreco(k)) {
        const n = lerNumero(cru);
        n === null ? erros.push(`${ROTULO[k]} "${cru}" inválido`) : (valores[k] = n);
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
    if (k === "precos") return precosIguais(a, b);
    if (k === "ativo") return !!a === !!b;
    return (a ?? "") === (b ?? "");
  };

  // As 3 colunas da planilha (Preço par / unidade / trio) viram o campo "precos" do banco.
  // Célula vazia = mantém o valor que a peça já tem; 0 = remove aquele tipo. O "preco" da peça
  // acompanha o primeiro tipo (Par), para continuar valendo em tudo que usa um preço só.
  function mesclarPrecos(valores, base) {
    const dadas = TIPOS_PRECO.filter((t) => valores[t.k] !== undefined);
    if (!dadas.length) return;
    const mapa = new Map(listaPrecos(base && base.precos).map((o) => [norm(o.rotulo), Number(o.valor)]));
    dadas.forEach((t) => (valores[t.k] > 0 ? mapa.set(norm(t.r), valores[t.k]) : mapa.delete(norm(t.r))));
    const precos = TIPOS_PRECO.filter((t) => mapa.has(norm(t.r))).map((t) => ({ rotulo: t.r, valor: mapa.get(norm(t.r)) }));
    TIPOS_PRECO.forEach((t) => delete valores[t.k]);
    valores.precos = precos.length ? precos : null;
    if (precos.length) valores.preco = precos[0].valor;
  }

  // chaves (opcional): chaves[i] identifica a peça da linha i na aba CATALOGO — é o que
  // liga cada linha à foto colada no Excel (sem depender do código, que pode repetir).
  function analisar(linhas, mapa, chaves) {
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const usados = new Set();
    const r = { alterados: [], novos: [], erros: [], iguais: 0, iguaisLista: [], chaveDe: new Map(), remover: [] };
    let ordem = proximaOrdem();
    for (let i = 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (l.every((c) => String(c).trim() === "")) continue;
      const get = (k) => (mapa[k] === undefined ? "" : l[mapa[k]]);
      const id = String(get("id")).trim();
      const { valores, erros } = lerCelulas(get, mapa);
      const ref = `Linha ${i + 1}`;
      const chave = chaves ? chaves[i] : undefined;
      if (id) {
        const atual = porId.get(id);
        if (!atual) { r.erros.push(`${ref}: o ID "${id}" não existe. Não altere a coluna ID.`); continue; }
        if (erros.length) { r.erros.push(`${ref} (${atual.nome}): ${erros.join("; ")}`); continue; }
        mesclarPrecos(valores, atual);
        const mudancas = Object.keys(valores).filter((k) => !igual(k, atual[k], valores[k]))
          .map((k) => ({ k, de: atual[k], para: valores[k] }));
        if (!mudancas.length) { r.iguais++; r.iguaisLista.push({ atual, chave }); continue; }
        const soMudou = Object.fromEntries(mudancas.map((m) => [m.k, m.para]));
        r.alterados.push({ atual, valores: soMudou, mudancas, chave });
      } else {
        if (erros.length) { r.erros.push(`${ref}: ${erros.join("; ")}`); continue; }
        mesclarPrecos(valores, null);
        if (!valores.nome || !valores.categoria || valores.preco === undefined) {
          r.erros.push(`${ref}: para cadastrar peça nova preencha Nome, Categoria e Preço (e deixe o ID vazio).`);
          continue;
        }
        const novoId = gerarId(valores.nome, usados);
        usados.add(novoId);
        const agora = new Date().toISOString();
        const novo = { ...linhaVazia(), ...valores, id: novoId, ordem: ordem++, ativo: valores.ativo ?? false, created_at: agora, updated_at: agora };
        r.novos.push(novo);
        if (chave !== undefined) r.chaveDe.set(novo, chave);
      }
    }
    return r;
  }

  function formatarValor(k, v) {
    if (k === "preco") return moeda(v);
    if (k === "precos") return textoPrecos(v) || "(vazio)";
    if (k === "foto") return `${v} foto(s)`;
    if (k === "ativo") return v ? "Sim" : "Não";
    if (k === "categoria") return CATEGORIAS[v] || v;
    if (LISTAS.includes(k)) return txtLista(v) || "(vazio)";
    const t = String(v ?? "");
    return t ? (t.length > 60 ? t.slice(0, 57) + "..." : t) : "(vazio)";
  }

  let pendente = null;
  let imagensPendentes = null; // { codigo: [Blob, ...] } — fotos achadas dentro do próprio Excel
  let financeiroPendente = null; // dados de estoque/vendas lidos da planilha (aba Financeiro)

  // ---------- Leitura da planilha de Controle de Estoque/Vendas original ----------
  // Aceita, além da planilha baixada pelo botão "Baixar planilha", a planilha de
  // controle de estoque (abas ENTRADAS / SAIDA / ESTOQUE / CATALOGO) tal como ela é,
  // sem precisar converter nada à mão antes de importar.

  function achaAba(wb, nomeNormalizado) {
    const n = wb.SheetNames.find((s) => norm(s) === nomeNormalizado);
    return n ? wb.Sheets[n] : null;
  }

  function extrairEstoque(X, wb) {
    const ws = achaAba(wb, "estoque");
    if (!ws) return {};
    const aoa = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    let iCab = -1, iModelo = -1;
    for (let i = 0; i < aoa.length; i++) {
      const j = aoa[i].findIndex((c) => norm(c) === "modelo");
      if (j >= 0) { iCab = i; iModelo = j; break; }
    }
    if (iCab < 0) return {};
    const cab = aoa[iCab].map(norm);
    const iNum = cab.findIndex((h) => h.includes("numeracoes disponiveis"));
    const iSit = cab.findIndex((h) => h === "situacao");
    const mapa = {};
    for (let i = iCab + 1; i < aoa.length; i++) {
      const modelo = String(aoa[i][iModelo] ?? "").trim();
      if (!modelo) continue;
      mapa[modelo] = {
        tamanhos: iNum >= 0 ? String(aoa[i][iNum] ?? "").trim() : "",
        situacao: iSit >= 0 ? String(aoa[i][iSit] ?? "").trim() : "",
      };
    }
    return mapa;
  }

  function buscaEstoque(mapa, codigo) {
    if (mapa[codigo]) return mapa[codigo];
    const base = codigo.replace(/\.\d+$/, "");
    return mapa[base] || null;
  }

  // Lê as linhas "Valor  |  Par: 60R$", "Unidade: 45R$" e "Trio: 85R$" do bloco da peça.
  function catalogoGetPrecos(bloco) {
    const achados = {};
    for (const linha of bloco) {
      for (const c of linha) {
        if (typeof c !== "string") continue;
        const m = /^\s*(par|unidade|trio)\s*:\s*(?:R\$)?\s*([\d.,]+)\s*(?:R\$)?\s*$/i.exec(c);
        if (m) {
          const n = lerNumero(m[2]);
          if (n !== null && n > 0) achados[norm(m[1])] = n;
        }
      }
    }
    return { par: achados.par ?? "", unidade: achados.unidade ?? "", trio: achados.trio ?? "" };
  }

  const CAT_LABELS = ["especificacoes", "acabamento", "conforto", "largura", "cor", "formato externo", "pedra", "detalhes", "numeracoes disponiveis"];

  function catalogoGetField(bloco, rotulo) {
    const alvo = norm(rotulo);
    for (const linha of bloco) {
      for (let j = 0; j < linha.length; j++) {
        const c = linha[j];
        if (typeof c === "string" && norm(c.replace(/:\s*$/, "")) === alvo) {
          for (let k = j + 1; k < linha.length; k++) {
            if (linha[k] !== "" && linha[k] != null) return String(linha[k]).trim();
          }
        }
      }
    }
    return "";
  }

  function catalogoGetNome(bloco) {
    let iSpec = bloco.findIndex((linha) => linha.some((c) => typeof c === "string" && norm(c.replace(/:\s*$/, "")) === "especificacoes"));
    const alvo = iSpec >= 0 ? bloco.slice(0, iSpec) : bloco;
    const candidatos = [];
    for (const linha of alvo) {
      for (const c of linha) {
        if (typeof c !== "string" || !c.trim()) continue;
        const s = c.trim();
        if (s.startsWith("=")) continue;
        if (CAT_LABELS.includes(norm(s.replace(/:\s*$/, "")))) continue;
        if (s.length > 8) candidatos.push(s);
      }
    }
    return candidatos.length ? candidatos[candidatos.length - 1] : "";
  }

  function posicoesCatalogo(aoa) {
    const posicoes = [];
    for (let i = 0; i < aoa.length; i++) {
      for (const c of aoa[i]) {
        if (typeof c === "string" && c.trim().startsWith("Cód")) {
          // Peça com numeração feminina e masculina separadas vem como "Cód.: AL032F | AL032M".
          const m = c.match(/Cód\.?:\s*([A-Za-z0-9.]+)(?:\s*\|\s*([A-Za-z0-9.]+))?/);
          posicoes.push({ linha: i, codigo: m ? m[1] : c.trim(), codigo2: m && m[2] ? m[2] : "" });
          break;
        }
      }
    }
    return posicoes;
  }

  // Quando o "Cód." do bloco traz dois códigos (ex.: "AL032F | AL032M"), o F/M no final
  // diz qual é a numeração feminina e qual é a masculina — não importa a ordem em que vêm.
  function codigosPorGenero(codigo, codigo2) {
    if (!codigo2) return null;
    const par = [codigo, codigo2];
    const fem = par.find((c) => /F$/i.test(c)) || "";
    const masc = par.find((c) => /M$/i.test(c)) || "";
    return (fem || masc) ? { fem, masc } : null;
  }

  function extrairCatalogo(X, wb) {
    const ws = achaAba(wb, "catalogo");
    if (!ws) return { produtos: [], posicoes: [] };
    const aoa = X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    const posicoes = posicoesCatalogo(aoa);
    const produtos = [];
    posicoes.forEach((p, idx) => {
      const inicio = idx > 0 ? posicoes[idx - 1].linha + 1 : Math.max(0, p.linha - 30);
      const bloco = aoa.slice(inicio, p.linha + 1);
      produtos.push({
        linha: p.linha,
        codigo: p.codigo,
        codigo2: p.codigo2,
        nome: catalogoGetNome(bloco),
        acabamento: catalogoGetField(bloco, "Acabamento"),
        conforto: catalogoGetField(bloco, "Conforto"),
        largura: catalogoGetField(bloco, "Largura"),
        cor: catalogoGetField(bloco, "Cor"),
        formato: catalogoGetField(bloco, "Formato Externo"),
        pedra: catalogoGetField(bloco, "Pedra"),
        detalhes: catalogoGetField(bloco, "Detalhes"),
        valores: catalogoGetPrecos(bloco),
      });
    });
    return { produtos, posicoes };
  }

  // Liga cada peça da planilha de estoque a uma peça que JÁ existe no site (pelo código +
  // nome; se o nome foi mudado, só pelo código quando ele é único). É isso que impede que
  // cada importação crie tudo de novo. Se houver cópias repetidas no site, escolhe a
  // "melhor" (com preço, visível, com foto, mais antiga) — as outras saem em "Remover duplicados".
  function casarComExistentes(catalogo) {
    const pontos = (p) => (Number(p.preco) > 0 ? 4 : 0) + (p.ativo ? 2 : 0) + ((p.imagens || []).length ? 1 : 0);
    const melhor = (a, b) => pontos(b) - pontos(a) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
    const codigosNaPlanilha = {};
    catalogo.forEach((p) => { const c = norm(p.codigo); codigosNaPlanilha[c] = (codigosNaPlanilha[c] || 0) + 1; });
    const usados = new Set();
    const casados = new Map(); // linha da peça -> produto já existente
    catalogo.forEach((p) => {
      const cod = norm(p.codigo), nome = norm(p.nome);
      const livres = produtos.filter((x) => !usados.has(x.id));
      let cand = livres.filter((x) => cod && norm(x.codigo) === cod && norm(x.nome) === nome);
      if (!cand.length) cand = livres.filter((x) => nome && norm(x.nome) === nome);
      if (!cand.length && cod && codigosNaPlanilha[cod] === 1) cand = livres.filter((x) => norm(x.codigo) === cod);
      if (!cand.length) return;
      const escolhido = cand.sort(melhor)[0];
      usados.add(escolhido.id);
      casados.set(p.linha, escolhido);
    });
    return casados;
  }

  // Converte a planilha de Controle de Estoque/Vendas (abas CATALOGO + ESTOQUE) para o
  // formato { linhas, mapa } que analisar() já sabe processar, como se fosse a planilha
  // baixada pelo botão "Baixar planilha".
  // Peça que já existe no site entra com o ID dela e SEM categoria/material/preço/descrição/
  // "mostrar no site" (a planilha de estoque não tem esses dados; célula vazia = mantém) —
  // assim reimportar nunca zera o preço nem esconde uma peça que você já ajustou. O resto
  // (nome, código, cor, pedra, largura, formato, acabamento, detalhes, numerações, foto)
  // segue a planilha. Exceção: os valores Par / Unidade / Trio da aba CATALOGO (alianças) são
  // lidos e gravados em "precos" — e aí o preço da peça passa a ser o do Par.
  function converterPlanilhaOriginal(X, wb) {
    const { produtos: catalogo, posicoes } = extrairCatalogo(X, wb);
    if (!catalogo.length) return null;
    const estoque = extrairEstoque(X, wb);
    const casados = casarComExistentes(catalogo);
    const mapa = {};
    COLUNAS.forEach((c, i) => (mapa[c.k] = i));
    const linhas = [COLUNAS.map((c) => c.t)];
    const chaves = [undefined]; // chaves[i] = linha da peça na aba CATALOGO (liga à foto)
    catalogo.forEach((p) => {
      const est = buscaEstoque(estoque, p.codigo) || {};
      const detalhes = [p.detalhes, p.conforto ? `Conforto: ${p.conforto}` : ""].filter(Boolean).join(" · ");
      const existente = casados.get(p.linha);
      // Peça com numeração feminina e masculina separadas (Cód. duplo no CATALOGO, ex.: AL032F |
      // AL032M): cada código tem sua própria linha na aba ESTOQUE, com sua própria numeração.
      // Sem isso, só a numeração do primeiro código entrava, e a do outro gênero se perdia.
      const genero = codigosPorGenero(p.codigo, p.codigo2);
      const estFem = genero && genero.fem ? buscaEstoque(estoque, genero.fem) : null;
      const estMasc = genero && genero.masc ? buscaEstoque(estoque, genero.masc) : null;
      const porChave = {
        id: existente ? existente.id : "",
        nome: p.nome,
        // Peça cujo nome começa com "ALIANÇA" vai para a categoria Alianças (inclusive as que já
        // estavam como Anéis). Os demais anéis: novos entram como Anéis; os existentes ficam como estão.
        categoria: /^alian[cç]a/i.test(norm(p.nome)) ? "Alianças" : (existente ? "" : "Anéis"),
        material: existente ? "" : "Aço Cirúrgico",
        preco: existente ? "" : 0,
        descricao: "", codigo: p.codigo, cor: p.cor, pedra: p.pedra, largura: p.largura,
        formato: p.formato, acabamento: p.acabamento, detalhes,
        preco_par: p.valores.par, preco_unidade: p.valores.unidade, preco_trio: p.valores.trio,
        tamanhos: genero ? "" : (est.tamanhos || ""),
        tamanhos_feminino: estFem ? estFem.tamanhos || "" : "",
        tamanhos_masculino: estMasc ? estMasc.tamanhos || "" : "",
        ativo: existente ? "" : "Não",
      };
      linhas.push(COLUNAS.map((c) => porChave[c.k]));
      chaves.push(p.linha);
    });
    return { linhas, mapa, chaves, posicoes, casados, catalogo, qtdJaExistiam: casados.size, qtdSemEstoqueCasado: catalogo.filter((p) => !buscaEstoque(estoque, p.codigo)).length };
  }

  // Peça que já existe, não mudou em nada, mas ganhou foto nova no Excel: conta como
  // alteração (senão nunca receberia a foto). Também anota a foto nas peças que já mudam.
  function incluirFotosNaPrevia(r) {
    if (!imagensPendentes) return;
    const fotosDe = (chave) => (chave !== undefined && imagensPendentes[chave]) || [];
    r.iguaisLista.forEach(({ atual, chave }) => {
      const fotos = fotosDe(chave);
      if ((atual.imagens || []).length || !fotos.length) return;
      r.alterados.push({ atual, valores: {}, mudancas: [{ k: "foto", de: 0, para: fotos.length }], chave });
      r.iguais--;
    });
    r.alterados.forEach((a) => {
      const fotos = fotosDe(a.chave);
      if (!fotos.length || (a.atual.imagens || []).length || a.mudancas.some((m) => m.k === "foto")) return;
      a.mudancas.push({ k: "foto", de: 0, para: fotos.length });
    });
  }

  // ---------- imagens embutidas no .xlsx (aba CATALOGO) ----------
  // Um .xlsx é, por dentro, um .zip com XML. As fotos ficam soltas em xl/media/*,
  // e o desenho (xl/drawings/drawingN.xml) diz em cima de qual linha cada uma foi
  // colada. Usamos o JSZip (só nesta função) pra ler esses arquivos sem precisar
  // do Excel instalado, e casamos a linha da imagem com o bloco da peça mais
  // próximo abaixo dela — a mesma ideia de "bloco" que já usamos pra pegar nome,
  // cor, pedra etc. na extrairCatalogo.
  function carregarScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => no(new Error("falha ao carregar " + src));
      document.head.appendChild(s);
    });
  }

  async function carregarJSZip() {
    if (window.JSZip) return window.JSZip;
    try {
      await carregarScript(JSZIP_URL);
    } catch (e) {
      await carregarScript(JSZIP_URL_RESERVA); // deixa propagar se essa também falhar
    }
    if (!window.JSZip) throw new Error("O leitor de imagens do Excel (JSZip) não carregou.");
    return window.JSZip;
  }

  // Resolve um caminho relativo de dentro do .xlsx (ex.: base "xl/worksheets/sheet4.xml"
  // + alvo "../drawings/drawing1.xml" -> "xl/drawings/drawing1.xml").
  function resolverCaminhoZip(base, alvo) {
    const partes = base.split("/");
    partes.pop();
    for (const p of alvo.split("/")) {
      if (p === "..") partes.pop();
      else if (p === "." || p === "") continue;
      else partes.push(p);
    }
    return partes.join("/");
  }

  function pastaDoArquivo(caminho) {
    const partes = caminho.split("/");
    const nome = partes.pop();
    return { pasta: partes.join("/"), nome };
  }

  function parseRelsMap(xml) {
    const mapa = {};
    (xml.match(/<Relationship\b[^>]*\/?>/g) || []).forEach((tag) => {
      const id = /Id="([^"]+)"/.exec(tag);
      const alvo = /Target="([^"]+)"/.exec(tag);
      if (id && alvo) mapa[id[1]] = alvo[1];
    });
    return mapa;
  }

  async function lerXmlDoZip(zip, caminho) {
    const f = zip.file(caminho);
    return f ? f.async("string") : null;
  }

  async function extrairImagensCatalogo(buffer, posicoes) {
    if (!posicoes || !posicoes.length) return {};
    const JSZip = await carregarJSZip();
    const zip = await JSZip.loadAsync(buffer);

    const workbookXml = await lerXmlDoZip(zip, "xl/workbook.xml");
    const workbookRelsXml = await lerXmlDoZip(zip, "xl/_rels/workbook.xml.rels");
    if (!workbookXml || !workbookRelsXml) throw new Error("não achei xl/workbook.xml dentro do arquivo");

    const mSheet = /<sheet\b[^>]*name="CATALOGO"[^>]*\/>/i.exec(workbookXml);
    const mRid = mSheet && /r:id="([^"]+)"/.exec(mSheet[0]);
    if (!mRid) throw new Error('não achei a aba "CATALOGO" no workbook');
    const alvoSheet = parseRelsMap(workbookRelsXml)[mRid[1]];
    if (!alvoSheet) throw new Error("não achei o relacionamento da aba CATALOGO");
    const sheetPath = resolverCaminhoZip("xl/workbook.xml", alvoSheet);

    const { pasta: pastaSheet, nome: nomeSheet } = pastaDoArquivo(sheetPath);
    const sheetRelsXml = await lerXmlDoZip(zip, `${pastaSheet}/_rels/${nomeSheet}.rels`);
    if (!sheetRelsXml) return {}; // aba sem nenhum objeto desenhado (sem fotos mesmo) — não é erro
    const relsSheet = parseRelsMap(sheetRelsXml);
    const ridDrawing = Object.keys(relsSheet).find((k) => /drawing\d*\.xml/i.test(relsSheet[k]));
    if (!ridDrawing) return {}; // idem
    const drawingPath = resolverCaminhoZip(sheetPath, relsSheet[ridDrawing]);

    const drawingXml = await lerXmlDoZip(zip, drawingPath);
    if (!drawingXml) throw new Error("não achei o arquivo de desenho (" + drawingPath + ")");
    const { pasta: pastaDrawing, nome: nomeDrawing } = pastaDoArquivo(drawingPath);
    const drawingRelsXml = await lerXmlDoZip(zip, `${pastaDrawing}/_rels/${nomeDrawing}.rels`);
    const relsDrawing = drawingRelsXml ? parseRelsMap(drawingRelsXml) : {};

    // Cada âncora do desenho traz a linha onde a foto foi colada + o r:embed da imagem.
    // Planilhas de catálogo costumam ter, colado em cada bloco, um ícone decorativo
    // pequeno (o mesmo repetido em toda peça) além da foto real — descartamos pelo
    // tamanho de exibição na planilha (<a:ext cx="..">), bem menor que uma foto de peça.
    const LIMIAR_EMU = 2000000; // ~5,5cm — abaixo disso é ícone/decoração, não foto
    const ancoras = [];
    drawingXml.split(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b/).slice(1).forEach((trecho) => {
      const mLinha = /<xdr:row>(\d+)<\/xdr:row>/.exec(trecho);
      const mEmbed = /r:embed="([^"]+)"/.exec(trecho);
      const mExt = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(trecho);
      if (mExt && (Number(mExt[1]) < LIMIAR_EMU || Number(mExt[2]) < LIMIAR_EMU)) return; // ícone pequeno, ignora
      if (mLinha && mEmbed) ancoras.push({ linha: Number(mLinha[1]), rId: mEmbed[1] });
    });
    if (!ancoras.length) return {};

    const posOrdenadas = [...posicoes].sort((a, b) => a.linha - b.linha);
    const resultado = {};
    for (const ancora of ancoras) {
      const alvoImg = relsDrawing[ancora.rId];
      if (!alvoImg) continue;
      const mediaPath = resolverCaminhoZip(drawingPath, alvoImg);
      const arq = zip.file(mediaPath);
      if (!arq) continue;
      const posicao = posOrdenadas.find((p) => p.linha >= ancora.linha);
      if (!posicao) continue;
      const ext = (mediaPath.split(".").pop() || "jpg").toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
      const bytes = await arq.async("uint8array");
      (resultado[posicao.linha] ||= []).push(new Blob([bytes], { type: mime }));
    }
    return resultado;
  }

  async function aoEscolherPlanilha(evento) {
    const arquivo = evento.target.files[0];
    evento.target.value = "";
    if (!arquivo) return;
    imagensPendentes = null;
    financeiroPendente = null;
    try {
      const buffer = await arquivo.arrayBuffer();
      const X = await carregarXLSX();
      const wb = X.read(buffer, { type: "array" });
      const linhas = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true });
      if (!linhas.length) throw new Error("A planilha está vazia.");
      const cab = linhas[0].map(norm);
      const mapa = {};
      COLUNAS.forEach((c) => {
        const i = cab.findIndex((h) => h === norm(c.t) || h === c.k);
        if (i >= 0) mapa[c.k] = i;
      });
      if (mapa.id === undefined) {
        const original = converterPlanilhaOriginal(X, wb);
        if (!original) throw new Error('Não encontrei a coluna "ID" nem as abas CATALOGO/ESTOQUE. Use a planilha baixada pelo botão "Baixar planilha", ou a sua planilha de Controle de Estoque/Vendas original.');
        pendente = analisar(original.linhas, original.mapa, original.chaves);
        let avisoFotos = "", falhaFotos = false;
        try {
          imagensPendentes = await extrairImagensCatalogo(buffer, original.posicoes);
          const qtdFotos = Object.keys(imagensPendentes).length;
          avisoFotos = qtdFotos ? ` — ${qtdFotos} peça(s) com foto encontrada no Excel, enviadas automaticamente ao aplicar (só pra quem ainda não tem foto)` : " — não encontrei fotos coladas na aba CATALOGO desta planilha";
        } catch (erroFotos) {
          imagensPendentes = {};
          falhaFotos = true;
          avisoFotos = ` — não consegui ler as fotos do Excel automaticamente (${erroFotos.message || erroFotos}); as peças serão importadas sem foto`;
        }
        incluirFotosNaPrevia(pendente);
        // A planilha manda: tudo que está no painel e NÃO está nela (inclusive cópias
        // repetidas de importações antigas) entra na lista pra ser removido.
        const idsNaPlanilha = new Set([...original.casados.values()].map((x) => x.id));
        pendente.remover = produtos.filter((x) => !idsNaPlanilha.has(x.id));
        // Estoque, entradas e vendas da mesma planilha alimentam a aba Financeiro.
        if (window.GestaoFinanceiro) {
          try { financeiroPendente = window.GestaoFinanceiro.lerPlanilha(X, wb, original.catalogo); } catch (e) { financeiroPendente = null; }
        }
        mostrarPrevia(pendente);
        const ja = original.qtdJaExistiam || 0;
        aviso(`Planilha de controle de estoque reconhecida${avisoFotos}. O painel vai ficar igual à planilha: ${original.linhas.length - 1} peça(s) — ${ja} já existem (atualizadas, sem duplicar), ${pendente.novos.length} nova(s) e ${pendente.remover.length} a remover. Visibilidade das que já existem fica como está, e o preço só muda nas peças que têm Par/Unidade/Trio na aba CATALOGO; as alianças vão para a categoria Alianças, as outras novas entram como Anéis, com preço 0 e aguardando confirmação (ocultas do site até você confirmar).`, falhaFotos ? "erro" : "ok");
        return;
      }
      pendente = analisar(linhas, mapa);
      mostrarPrevia(pendente);
    } catch (erro) {
      aviso("Erro ao ler a planilha: " + (erro.message || erro), "erro");
    }
  }

  function mostrarPrevia(r) {
    const remover = r.remover || [];
    const alterados = r.alterados.map((a) => `<li><strong>${esc(a.atual.nome)}</strong><br>${a.mudancas.map((m) =>
      `${esc(ROTULO[m.k])}: ${esc(formatarValor(m.k, m.de))} → <b>${esc(formatarValor(m.k, m.para))}</b>`).join("<br>")}</li>`).join("");
    const novos = r.novos.map((n) => {
      const chave = r.chaveDe && r.chaveDe.get(n);
      const temFoto = imagensPendentes && chave !== undefined && imagensPendentes[chave] && imagensPendentes[chave].length;
      return `<li><strong>${esc(n.nome)}</strong> · ${esc(CATEGORIAS[n.categoria])} · ${moeda(n.preco)}${temFoto ? " · 📷 foto encontrada" : ""}${n.ativo ? "" : " · <em>entra aguardando confirmação (oculta do site)</em>"}</li>`;
    }).join("");
    const removidos = remover.slice(0, 60).map((p) => `<li><strong>${esc(p.nome)}</strong>${p.codigo ? ` · ${esc(p.codigo)}` : ""}${Number(p.preco) > 0 ? ` · ${moeda(p.preco)}` : ""}</li>`).join("")
      + (remover.length > 60 ? `<li>...e mais ${remover.length - 60} produto(s)</li>` : "");
    const erros = r.erros.map((e) => `<li>${esc(e)}</li>`).join("");
    abrirModal(`
      <h2>Prévia da importação</h2>
      <p>${r.alterados.length} para alterar · ${r.novos.length} novo(s) · ${r.iguais} sem mudança · ${remover.length} a remover · ${r.erros.length} com problema</p>
      ${financeiroPendente ? `<p>💰 <strong>Financeiro:</strong> ${financeiroPendente.resumo.modelos} modelo(s) de estoque (${financeiroPendente.resumo.pecas} peça(s)), ${financeiroPendente.resumo.vendas} saída(s) e ${financeiroPendente.resumo.entradas} entrada(s) serão atualizados na aba Financeiro. Custo e preço de venda que você definiu lá continuam como estão.</p>` : ""}
      ${remover.length ? `<h3>Não estão na planilha</h3>
        <label class="prod-check"><input type="checkbox" id="imp-remover" checked> Remover do painel os ${remover.length} produto(s) abaixo (o painel fica igual à planilha; cópias repetidas incluídas)</label>
        <ul class="imp-lista erro">${removidos}</ul>` : ""}
      ${r.alterados.length ? `<h3>Alterações</h3><ul class="imp-lista">${alterados}</ul>` : ""}
      ${r.novos.length ? `<h3>Novos produtos</h3><p class="field-hint">Quem tem 📷 recebe a foto do Excel ao aplicar; as demais ficam sem foto até você enviar pela tela da peça.</p><ul class="imp-lista">${novos}</ul>` : ""}
      ${r.erros.length ? `<h3>Linhas ignoradas</h3><ul class="imp-lista erro">${erros}</ul>` : ""}
      <p id="f-erro" class="prod-msg erro" hidden></p>
      <div class="prod-botoes">
        <button type="button" class="btn btn-primary" id="imp-aplicar">Aplicar</button>
        <button type="button" class="btn btn-line" data-imp="cancelar">Cancelar</button>
      </div>`);
    const atualizarBotao = () => {
      const marcado = !!($("imp-remover") && $("imp-remover").checked);
      const total = r.alterados.length + r.novos.length + (marcado ? remover.length : 0);
      const fin = !!financeiroPendente;
      $("imp-aplicar").disabled = !total && !fin;
      $("imp-aplicar").textContent = total ? `Aplicar ${total} alteração(ões)${fin ? " + financeiro" : ""}` : (fin ? "Atualizar financeiro" : "Aplicar");
    };
    if ($("imp-remover")) $("imp-remover").addEventListener("change", atualizarBotao);
    atualizarBotao();
    $("imp-aplicar").addEventListener("click", aplicarPlanilha);
  }

  async function aplicarPlanilha(evento) {
    const botao = evento.currentTarget;
    const removerMarcado = !!($("imp-remover") && $("imp-remover").checked);
    const paraRemover = removerMarcado ? (pendente.remover || []) : [];
    botao.disabled = true;
    botao.textContent = "Aplicando...";

    // Se a planilha tinha fotos embutidas, envia agora pro Storage (só pra quem
    // ainda não tem foto nenhuma — nunca sobrescreve foto que já foi enviada à mão).
    let falhasFoto = 0, primeiroErroFoto = "";
    if (imagensPendentes && Object.keys(imagensPendentes).length) {
      let enviadas = 0;
      for (const novo of pendente.novos) {
        const fotos = imagensPendentes[pendente.chaveDe.get(novo)];
        if (!fotos || !fotos.length || (novo.imagens && novo.imagens.length)) continue;
        botao.textContent = `Enviando fotos (${++enviadas})...`;
        try {
          const urls = [];
          for (const blob of fotos) urls.push(await enviarFoto(blob));
          novo.imagens = urls;
        } catch (e) { falhasFoto++; primeiroErroFoto = primeiroErroFoto || (e.message || String(e)); }
      }
      for (const alt of pendente.alterados) {
        const fotos = alt.chave !== undefined && imagensPendentes[alt.chave];
        const jaTemFoto = (alt.atual.imagens && alt.atual.imagens.length) || (alt.valores.imagens && alt.valores.imagens.length);
        if (!fotos || !fotos.length || jaTemFoto) continue;
        botao.textContent = `Enviando fotos (${++enviadas})...`;
        try {
          const urls = [];
          for (const blob of fotos) urls.push(await enviarFoto(blob));
          alt.valores.imagens = urls;
        } catch (e) { falhasFoto++; primeiroErroFoto = primeiroErroFoto || (e.message || String(e)); }
      }
      botao.textContent = "Aplicando...";
    }

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
        el.textContent = "Erro ao gravar: " + msgErroBanco(error.message);
        el.hidden = false;
        return;
      }
    }
    // Tira do painel o que não está na planilha (só depois de gravar o resto com sucesso).
    let removidos = 0, erroRemocao = "";
    if (paraRemover.length) {
      botao.textContent = "Removendo o que não está na planilha...";
      const ids = paraRemover.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await db.from("produtos").delete().in("id", ids.slice(i, i + 100)).select();
        if (error) { erroRemocao = error.message; break; }
        removidos += (data || []).length;
      }
      if (!erroRemocao && ids.length && !removidos) erroRemocao = "nada foi apagado (sessão expirada?)";
      if (removidos) {
        const apagadosIds = new Set(ids);
        const emUso = new Set([...produtos.filter((p) => !apagadosIds.has(p.id)), ...linhas].flatMap((p) => p.imagens || []));
        const fotosSoltas = paraRemover.flatMap((p) => p.imagens || []).filter((u) => !emUso.has(u));
        for (let i = 0; i < fotosSoltas.length; i += 100) await apagarFotos(fotosSoltas.slice(i, i + 100));
      }
    }
    // Aba Financeiro (estoque/vendas da planilha). Falha aqui não desfaz o que já foi gravado.
    let fin = null;
    if (financeiroPendente && window.GestaoFinanceiro) {
      botao.textContent = "Atualizando financeiro...";
      fin = await window.GestaoFinanceiro.aplicar(financeiroPendente);
    }
    fecharModal();
    const problemas = [];
    if (fin && !fin.ok) problemas.push(`financeiro não atualizado: ${fin.erro}`);
    if (falhasFoto) problemas.push(`${falhasFoto} foto(s) não subiram: ${primeiroErroFoto}`);
    if (erroRemocao) problemas.push(`não consegui remover o que sobrou fora da planilha: ${erroRemocao}`);
    aviso(`Pronto: ${pendente.alterados.length} atualizado(s), ${pendente.novos.length} novo(s)${paraRemover.length ? `, ${removidos} removido(s)` : ""}${fin && fin.ok ? `; financeiro: ${fin.modelos} modelo(s) e ${fin.vendas} saída(s)` : ""}. O site já está atualizado.${problemas.length ? ` (${problemas.join("; ")})` : ""}`, problemas.length ? "erro" : undefined);
    pendente = null;
    imagensPendentes = null;
    financeiroPendente = null;
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

#aba-pedidos[hidden], #aba-produtos[hidden], #aba-financeiro[hidden], .prod-modal[hidden], .prod-msg[hidden], .prod-vazio[hidden] { display: none !important; }

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
/* Confirmado (aparece no site): borda preta */
.prod-card.confirmado, .prod-card.confirmado:hover, .prod-card.confirmado:focus-visible { border-color: #000; box-shadow: 0 0 0 1px #000; }
[data-theme="dark"] .prod-card.confirmado, [data-theme="dark"] .prod-card.confirmado:hover, [data-theme="dark"] .prod-card.confirmado:focus-visible { border-color: #fff; box-shadow: 0 0 0 1px #fff; }
.status-confirmado { background: #000; color: #fff; }
[data-theme="dark"] .status-confirmado { background: #fff; color: #000; }
.prod-conf { margin-top: 0.4rem; padding: 0.25em 0.9em; font-family: var(--font-body); font-size: 0.78rem; border-radius: 999px; border: 1px solid var(--gold-dim); background: transparent; color: var(--ink); cursor: pointer; }
.prod-conf:hover { background: var(--gold-light); }
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
    ["pedidos", "produtos", "financeiro"].forEach((n) => { const el = $("aba-" + n); if (el) el.hidden = nome !== n; });
    if (nome === "produtos") carregar();
    if (nome === "financeiro" && window.GestaoFinanceiro) window.GestaoFinanceiro.abrir();
  }

  function iniciar() {
    if (!$("aba-produtos")) return;
    const barraAbas = document.querySelector(".gestao-abas");
    if (barraAbas) barraAbas.addEventListener("click", (e) => { const b = e.target.closest(".gestao-aba"); if (b) trocarAba(b.dataset.aba); });
    $("prod-busca").addEventListener("input", desenhar);
    $("prod-novo").addEventListener("click", () => abrirEditor(null));
    $("prod-baixar").addEventListener("click", baixarPlanilha);
    $("prod-importar").addEventListener("click", () => $("prod-arquivo").click());
    const btnConf = document.createElement("button");
    btnConf.type = "button";
    btnConf.id = "prod-confirmar-tudo";
    btnConf.className = "btn btn-line";
    btnConf.textContent = "Confirmar tudo";
    $("prod-importar").after(btnConf);
    btnConf.addEventListener("click", verConfirmarTudo);
    const btnDup = document.createElement("button");
    btnDup.type = "button";
    btnDup.id = "prod-duplicados";
    btnDup.className = "btn btn-line";
    btnDup.textContent = "Remover duplicados";
    btnConf.after(btnDup);
    btnDup.addEventListener("click", verDuplicados);
    const btnApagar = document.createElement("button");
    btnApagar.type = "button";
    btnApagar.id = "prod-apagar-tudo";
    btnApagar.className = "btn btn-line";
    btnApagar.textContent = "Excluir tudo";
    btnApagar.style.color = "#a12b2b";
    btnDup.after(btnApagar);
    btnApagar.addEventListener("click", verApagarTudo);
    const btnVal = document.createElement("button");
    btnVal.type = "button";
    btnVal.id = "prod-valores-aliancas";
    btnVal.className = "btn btn-line";
    btnVal.textContent = "Valores das alianças";
    $("prod-novo").after(btnVal);
    btnVal.addEventListener("click", verValoresAliancas);
    // Carimbo de versão: se este número não aparecer na tela, o navegador ainda está com o arquivo antigo.
    const selo = document.createElement("p");
    selo.className = "field-hint";
    selo.style.margin = "0.25rem 0 0";
    selo.textContent = "Painel de produtos — versão " + VERSAO_PAINEL;
    $("prod-barra").after(selo);
    $("prod-arquivo").addEventListener("change", aoEscolherPlanilha);
    $("prod-importar-site").addEventListener("click", (e) => importarDoSite(e.currentTarget));
    $("prod-lista").addEventListener("click", (e) => {
      const conf = e.target.closest("[data-conf]");
      if (conf) { alternarConfirmacao(conf.dataset.conf); return; }
      const card = e.target.closest(".prod-card");
      if (card) abrirEditor(produtos.find((p) => p.id === card.dataset.id));
    });
    $("prod-lista").addEventListener("keydown", (e) => {
      if (e.target.closest("[data-conf]")) return; // Enter no botão = clique do botão, não abre o editor
      const card = e.target.closest(".prod-card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirEditor(produtos.find((p) => p.id === card.dataset.id)); }
    });
    $("prod-modal-corpo").addEventListener("click", aoClicarModal);
    $("prod-modal-corpo").addEventListener("change", (e) => { if (e.target.id === "f-fotos") aoEscolherFotos(e); });
  }

  injetarEstilo();
  document.addEventListener("DOMContentLoaded", iniciar);
})();
