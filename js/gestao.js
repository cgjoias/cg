// ============================================================
// ACESSO AO PAINEL
// O login de verdade é feito pelo Supabase Auth (email + senha).
// Quem protege os dados dos clientes é a política de RLS lá no
// banco (supabase/schema.sql), não este arquivo — então mesmo que
// alguém veja este código, não consegue ler os pedidos sem logar.
// Crie seu usuário em: Supabase > Authentication > Users > Add user.
// ============================================================

function formatarPreco(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------- utilidades ----------
// Tudo que o cliente digita no formulário público passa por aqui antes de
// entrar no HTML, para que ninguém consiga injetar código no seu painel.
const escPed = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normPed = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const ICONES_PED = {
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  carteira: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  whats: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  nota: '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
};
const svgPed = (nome, tam) => `<svg viewBox="0 0 24 24" width="${tam || 18}" height="${tam || 18}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES_PED[nome]}</svg>`;

// Número no formato do wa.me: só dígitos, com DDI 55 (Brasil).
function numeroWhats(bruto) {
  let n = String(bruto || "").replace(/\D/g, "");
  if (n.startsWith("0")) n = n.replace(/^0+/, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return n;
}

function linkWhats(grupo) {
  const numero = numeroWhats(grupo.whatsapp);
  const primeiro = (grupo.nome || "").trim().split(/\s+/)[0] || "";
  const pecas = grupo.itens.map((i) => i.produto_nome).join(", ");
  const texto = `Olá${primeiro ? ", " + primeiro : ""}! Aqui é da CG Acessórios. Recebemos o seu pedido (${pecas}) e queria combinar os detalhes com você.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function iniciais(nome) {
  const partes = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  return ((partes[0] || "?")[0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function quando(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return { abs: "", rel: "" };
  const abs = d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  let rel;
  if (min < 1) rel = "agora mesmo";
  else if (min < 60) rel = `há ${min} min`;
  else if (min < 1440) rel = `há ${Math.floor(min / 60)} h`;
  else rel = `há ${Math.floor(min / 1440)} d`;
  return { abs, rel };
}

// ---------- dados ----------
let linhasPedidos = [];   // linhas cruas do banco (uma por peça)
let gruposPedidos = [];   // pedidos agrupados (uma sacola = um cartão)
let filtroPedidos = "todos";
let buscaPedidos = "";
let chavesConhecidas = null;
const TITULO_ORIGINAL = document.title;

// Uma sacola com várias peças vira várias linhas no banco, todas com o mesmo
// cliente e o mesmo horário. Aqui elas voltam a ser um pedido só.
function agruparPedidos(linhas) {
  const mapa = new Map();
  linhas.forEach((p) => {
    const chave = `${p.whatsapp}|${p.nome}|${String(p.created_at).slice(0, 19)}`;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, nome: p.nome, whatsapp: p.whatsapp, email: p.email, endereco: p.endereco, observacoes: p.observacoes, created_at: p.created_at, itens: [], ids: [] };
      mapa.set(chave, g);
    }
    g.itens.push(p);
    g.ids.push(p.id);
    if (!g.observacoes && p.observacoes) g.observacoes = p.observacoes;
    if (!g.email && p.email) g.email = p.email;
  });
  return [...mapa.values()].map((g) => {
    g.total = g.itens.reduce((soma, i) => soma + Number(i.preco || 0), 0);
    g.confirmado = g.itens.every((i) => i.status === "Confirmado");
    return g;
  });
}

// ---------- desenho ----------
function cardPedido(g) {
  const t = quando(g.created_at);
  const box = document.createElement("article");
  box.className = "ped-card" + (g.confirmado ? " confirmado" : "");
  const itens = g.itens.map((i) => `
      <li>
        <div class="ped-item-txt">
          <span class="ped-item-nome" title="${escPed(i.produto_nome)}">${escPed(i.produto_nome)}</span>
          ${i.detalhes ? `<span class="ped-item-det" title="${escPed(i.detalhes)}">${escPed(i.detalhes)}</span>` : ""}
        </div>
        <strong>${formatarPreco(i.preco)}</strong>
      </li>`).join("");
  const ids = g.ids.join(",");

  const end = g.endereco || "Endereço a combinar";
  const obs = g.observacoes || "Sem observações";
  box.innerHTML = `
    <div class="ped-card-topo">
      <span class="ped-avatar" aria-hidden="true">${escPed(iniciais(g.nome))}</span>
      <div class="ped-cliente">
        <h3 title="${escPed(g.nome)}">${escPed(g.nome)}</h3>
        <span class="ped-quando" title="${escPed(t.abs)}">${escPed(t.rel)} · ${escPed(t.abs)}</span>
      </div>
      <span class="status-tag status-${g.confirmado ? "confirmado" : "pendente"}">${g.confirmado ? "Confirmado" : "Pendente"}</span>
    </div>

    <ul class="ped-itens">${itens}</ul>
    <div class="ped-total"><span>${g.itens.length > 1 ? `Total · ${g.itens.length} peças` : "Total"}</span><strong>${formatarPreco(g.total)}</strong></div>

    <div class="ped-info">
      <p title="${escPed(end)}">${svgPed("pin", 16)}<span>${escPed(end)}</span></p>
      <p class="${g.observacoes ? "" : "vazio"}" title="${escPed(obs)}">${svgPed("nota", 16)}<span>${escPed(obs)}</span></p>
    </div>

    <div class="ped-contatos">
      <a class="ped-contato ped-whats" href="${escPed(linkWhats(g))}" target="_blank" rel="noopener">
        <img src="assets/img/contato/whatsapp.png" alt="" width="30" height="30">
        <span class="ped-contato-txt"><strong>Chamar no WhatsApp</strong><small>${escPed(g.whatsapp)}</small></span>
      </a>
      ${g.email
        ? `<a class="ped-contato ped-mail" href="mailto:${escPed(g.email)}" title="${escPed(g.email)}">
            <img src="assets/img/contato/gmail.png" alt="" width="30" height="30">
            <span class="ped-contato-txt"><strong>Enviar e-mail</strong><small>${escPed(g.email)}</small></span>
          </a>`
        : `<span class="ped-contato ped-mail sem">
            <img src="assets/img/contato/gmail.png" alt="" width="30" height="30">
            <span class="ped-contato-txt"><strong>E-mail</strong><small>não informado</small></span>
          </span>`}
    </div>

    <div class="pedido-actions">
      ${g.confirmado
        ? `<button type="button" class="btn btn-line" data-ped="reabrir" data-ids="${ids}">Voltar p/ pendente</button>`
        : `<button type="button" class="btn btn-primary" data-ped="confirmar" data-ids="${ids}">Confirmar</button>`}
      <button type="button" class="btn btn-danger" data-ped="excluir" data-ids="${ids}">Excluir</button>
    </div>
  `;
  return box;
}

function kpiPed(icone, rotulo, valor, dica, cor) {
  return `<article class="ped-kpi" style="--kpi:${cor}"><span class="ped-kpi-icone">${svgPed(icone, 24)}</span>
    <div class="ped-kpi-txt"><span class="ped-rotulo">${escPed(rotulo)}</span><strong class="ped-valor">${escPed(valor)}</strong>${dica ? `<span class="ped-dica">${escPed(dica)}</span>` : ""}</div></article>`;
}

function desenharPedidos() {
  const pendentes = gruposPedidos.filter((g) => !g.confirmado);
  const confirmados = gruposPedidos.filter((g) => g.confirmado);
  const soma = (l) => l.reduce((t, g) => t + g.total, 0);

  document.getElementById("ped-kpis").innerHTML = [
    kpiPed("relogio", "Aguardando contato", String(pendentes.length), pendentes.length === 1 ? "pedido pendente" : "pedidos pendentes", "#E07A9A"),
    kpiPed("carteira", "A receber", formatarPreco(soma(pendentes)), "soma dos pendentes", "#B0416B"),
    kpiPed("check", "Confirmados", String(confirmados.length), confirmados.length === 1 ? "pedido fechado" : "pedidos fechados", "#5B8A72"),
    kpiPed("recibo", "Valor confirmado", formatarPreco(soma(confirmados)), "soma dos confirmados", "#D4A017"),
  ].join("");

  const q = normPed(buscaPedidos);
  const passa = (g) => !q || normPed([g.nome, g.whatsapp, g.email, g.endereco, ...g.itens.map((i) => i.produto_nome)].join(" ")).includes(q);

  const preencher = (idLista, lista, vazio) => {
    const el = document.getElementById(idLista);
    el.innerHTML = "";
    const visiveis = lista.filter(passa);
    if (!visiveis.length) {
      el.innerHTML = `<p class="ped-vazio">${q ? "Nenhum pedido encontrado para essa busca." : vazio}</p>`;
      return;
    }
    visiveis.forEach((g) => el.appendChild(cardPedido(g)));
  };
  preencher("lista-pendentes", pendentes, "Nenhum pedido pendente. Quando chegar um novo, ele aparece aqui.");
  preencher("lista-confirmados", confirmados, "Nenhum pedido confirmado ainda.");

  document.getElementById("cont-pendentes").textContent = pendentes.length;
  document.getElementById("cont-confirmados").textContent = confirmados.length;
  document.getElementById("sec-pendentes").hidden = filtroPedidos === "confirmados";
  document.getElementById("sec-confirmados").hidden = filtroPedidos === "pendentes";

  document.title = pendentes.length ? `(${pendentes.length}) ${TITULO_ORIGINAL}` : TITULO_ORIGINAL;
}

function avisoPed(texto, tipo) {
  const el = document.getElementById("ped-msg");
  if (!el) return;
  el.textContent = texto;
  el.className = "prod-msg " + (tipo === "erro" ? "erro" : "ok");
  el.hidden = false;
  clearTimeout(avisoPed.t);
  if (tipo !== "erro") avisoPed.t = setTimeout(() => (el.hidden = true), 8000);
}

async function carregarPedidos(silencioso) {
  const { data, error } = await db.from("pedidos").select("*").order("created_at", { ascending: false });
  if (error) {
    document.getElementById("lista-pendentes").innerHTML = `<p class="ped-vazio">Erro ao carregar pedidos: ${escPed(error.message)}</p>`;
    return;
  }
  linhasPedidos = data || [];
  gruposPedidos = agruparPedidos(linhasPedidos);

  // Aviso de pedido novo (só depois da primeira carga)
  const pendentesAgora = gruposPedidos.filter((g) => !g.confirmado);
  if (chavesConhecidas && silencioso) {
    const novos = pendentesAgora.filter((g) => !chavesConhecidas.has(g.chave));
    if (novos.length) avisoPed(novos.length === 1 ? `Novo pedido de ${novos[0].nome}!` : `${novos.length} novos pedidos chegaram!`);
  }
  chavesConhecidas = new Set(gruposPedidos.map((g) => g.chave));

  document.getElementById("ped-atualizado").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · a lista se atualiza sozinha a cada minuto.`;
  desenharPedidos();
}

async function exportarPedidos() {
  if (!linhasPedidos.length) { avisoPed("Não há pedidos para exportar.", "erro"); return; }
  try {
    if (!window.XLSX) {
      await new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        s.onload = ok; s.onerror = () => falha(new Error("Não foi possível carregar o gerador de planilhas."));
        document.head.appendChild(s);
      });
    }
    const linhas = linhasPedidos.map((p) => ({
      Data: new Date(p.created_at).toLocaleString("pt-BR"),
      Cliente: p.nome,
      WhatsApp: p.whatsapp,
      "E-mail": p.email || "",
      Endereço: p.endereco || "",
      Peça: p.produto_nome,
      Categoria: p.categoria || "",
      Valor: Number(p.preco || 0),
      Detalhes: p.detalhes || "",
      Observações: p.observacoes || "",
      Status: p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [18, 24, 16, 26, 30, 32, 12, 10, 30, 30, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    avisoPed(e.message || "Erro ao exportar.", "erro");
  }
}

async function tratarAcao(evento) {
  const botao = evento.target.closest("[data-ped]");
  if (!botao) return;
  const acao = botao.dataset.ped;
  const ids = (botao.dataset.ids || "").split(",").filter(Boolean);
  if (!ids.length) return;

  let erro = null;
  if (acao === "confirmar" || acao === "reabrir") {
    ({ error: erro } = await db.from("pedidos").update({ status: acao === "confirmar" ? "Confirmado" : "Pendente" }).in("id", ids));
  } else if (acao === "excluir") {
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;
    ({ error: erro } = await db.from("pedidos").delete().in("id", ids));
  }
  if (erro) { avisoPed("Não foi possível concluir: " + erro.message, "erro"); return; }
  carregarPedidos();
}

async function excluirTodosPedidos() {
  if (!linhasPedidos.length) return;
  if (!confirm(`Excluir TODOS os ${gruposPedidos.length} pedidos? Isso não pode ser desfeito.\n\nDica: use "Exportar para Excel" antes.`)) return;
  const { error } = await db.from("pedidos").delete().not("id", "is", null);
  if (error) { avisoPed("Não foi possível excluir: " + error.message, "erro"); return; }
  carregarPedidos();
}

function ligarControlesPedidos() {
  document.getElementById("btn-atualizar").addEventListener("click", () => carregarPedidos());
  document.getElementById("btn-exportar").addEventListener("click", exportarPedidos);
  document.getElementById("btn-excluir-todos").addEventListener("click", excluirTodosPedidos);
  document.getElementById("ped-busca").addEventListener("input", (e) => { buscaPedidos = e.target.value; desenharPedidos(); });
  document.getElementById("ped-filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b) return;
    filtroPedidos = b.dataset.filtro;
    document.querySelectorAll("#ped-filtros button").forEach((x) => x.classList.toggle("ativo", x === b));
    desenharPedidos();
  });
  // Atualiza sozinho: com a aba de Pedidos aberta, procura pedidos novos a cada minuto.
  setInterval(() => {
    const painel = document.getElementById("painel-gestao");
    const aba = document.getElementById("aba-pedidos");
    if (!painel.hidden && !aba.hidden && !document.hidden) carregarPedidos(true);
  }, 60000);
}

function mostrarPainel(painel, portao) {
  portao.hidden = true;
  painel.hidden = false;
  carregarPedidos();
}

function mostrarPortao(painel, portao) {
  painel.hidden = true;
  portao.hidden = false;
}

async function iniciarGestao() {
  const painel = document.getElementById("painel-gestao");
  const portao = document.getElementById("portao-acesso");
  if (!painel) return;

  // Se já existe uma sessão válida (ex.: usuário deu F5), entra direto.
  const { data: { session } } = await db.auth.getSession();
  if (session) mostrarPainel(painel, portao);

  const formAcesso = document.getElementById("form-acesso");
  formAcesso.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erroBox = document.getElementById("acesso-erro");
    erroBox.hidden = true;

    const email = document.getElementById("email-acesso").value.trim();
    const senha = document.getElementById("senha-acesso").value;
    const botao = formAcesso.querySelector('button[type="submit"]');
    botao.disabled = true;
    botao.textContent = "Entrando...";

    const { error } = await db.auth.signInWithPassword({ email, password: senha });

    botao.disabled = false;
    botao.textContent = "Entrar";

    if (error) {
      erroBox.hidden = false;
      return;
    }
    mostrarPainel(painel, portao);
  });

  document.getElementById("btn-sair").addEventListener("click", async () => {
    await db.auth.signOut();
    mostrarPortao(painel, portao);
  });

  ligarControlesPedidos();
  painel.addEventListener("click", tratarAcao);
}

document.addEventListener("DOMContentLoaded", iniciarGestao);
