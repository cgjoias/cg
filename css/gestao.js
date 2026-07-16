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

function cardPedido(pedido) {
  const box = document.createElement("article");
  box.className = "pedido-box";
  box.innerHTML = `
    <div class="pedido-details">
      <h3>${pedido.produto_nome}</h3>
      <p><strong>Cliente:</strong> ${pedido.nome}</p>
      <p><strong>WhatsApp:</strong> ${pedido.whatsapp}</p>
      <p><strong>Endereço:</strong> ${pedido.endereco || "A combinar"}</p>
      <p><strong>Valor:</strong> ${formatarPreco(pedido.preco)}</p>
      <p><strong>Detalhes:</strong> ${pedido.detalhes || "—"}</p>
      <p><strong>Observações:</strong> ${pedido.observacoes || "—"}</p>
      <p><strong>Status:</strong> <span class="status-tag status-${pedido.status.toLowerCase()}">${pedido.status}</span></p>
    </div>
    <div class="pedido-actions">
      ${pedido.status !== "Confirmado" ? `<button class="btn btn-primary" data-acao="confirmar" data-id="${pedido.id}">Confirmar</button>` : ""}
      <button class="btn btn-danger" data-acao="excluir" data-id="${pedido.id}">Excluir</button>
    </div>
  `;
  return box;
}

let ultimosPedidos = [];

async function carregarPedidos() {
  const listaPendentes = document.getElementById("lista-pendentes");
  const listaConfirmados = document.getElementById("lista-confirmados");
  listaPendentes.innerHTML = "";
  listaConfirmados.innerHTML = "";

  const { data, error } = await db.from("pedidos").select("*").order("created_at", { ascending: false });

  if (error) {
    listaPendentes.innerHTML = `<p>Erro ao carregar pedidos: ${error.message}</p>`;
    return;
  }

  ultimosPedidos = data;

  if (!data.length) {
    listaPendentes.innerHTML = "<p>Nenhum pedido pendente.</p>";
    listaConfirmados.innerHTML = "<p>Nenhum pedido confirmado.</p>";
    return;
  }

  const pendentes = data.filter((p) => p.status !== "Confirmado");
  const confirmados = data.filter((p) => p.status === "Confirmado");

  pendentes.forEach((p) => listaPendentes.appendChild(cardPedido(p)));
  confirmados.forEach((p) => listaConfirmados.appendChild(cardPedido(p)));

  if (!pendentes.length) listaPendentes.innerHTML = "<p>Nenhum pedido pendente.</p>";
  if (!confirmados.length) listaConfirmados.innerHTML = "<p>Nenhum pedido confirmado.</p>";
}

function celulaCsv(valor) {
  const texto = String(valor ?? "").replace(/"/g, '""');
  return `"${texto}"`;
}

function exportarParaExcel() {
  if (!ultimosPedidos.length) {
    alert("Não há pedidos para exportar.");
    return;
  }

  const colunas = [
    "Data", "Nome", "WhatsApp", "Endereço", "Produto", "Categoria",
    "Valor", "Detalhes", "Observações", "Status",
  ];

  const linhas = ultimosPedidos.map((p) => [
    new Date(p.created_at).toLocaleString("pt-BR"),
    p.nome, p.whatsapp, p.endereco || "", p.produto_nome, p.categoria,
    formatarPreco(p.preco), p.detalhes || "", p.observacoes || "", p.status,
  ]);

  // \uFEFF (BOM) no início garante que o Excel abra os acentos certos.
  const csv = "\uFEFF" + [colunas, ...linhas]
    .map((linha) => linha.map(celulaCsv).join(";"))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const dataArquivo = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `pedidos-${dataArquivo}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function excluirTodosOsPedidos() {
  if (!ultimosPedidos.length) {
    alert("Não há pedidos para excluir.");
    return;
  }
  const confirmacao1 = confirm(
    `Isso vai excluir PERMANENTEMENTE os ${ultimosPedidos.length} pedidos do Supabase.\n` +
    "Só faça isso depois de já ter exportado para Excel.\n\nContinuar?"
  );
  if (!confirmacao1) return;

  const confirmacao2 = confirm("Tem certeza mesmo? Essa ação não pode ser desfeita.");
  if (!confirmacao2) return;

  const ids = ultimosPedidos.map((p) => p.id);
  const { error } = await db.from("pedidos").delete().in("id", ids);
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }
  carregarPedidos();
}

async function tratarAcao(evento) {
  const botao = evento.target.closest("[data-acao]");
  if (!botao) return;
  const { acao, id } = botao.dataset;

  if (acao === "confirmar") {
    await db.from("pedidos").update({ status: "Confirmado" }).eq("id", id);
    carregarPedidos();
  }

  if (acao === "excluir") {
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;
    await db.from("pedidos").delete().eq("id", id);
    carregarPedidos();
  }
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

  document.getElementById("btn-exportar").addEventListener("click", exportarParaExcel);
  document.getElementById("btn-excluir-todos").addEventListener("click", excluirTodosOsPedidos);

  painel.addEventListener("click", tratarAcao);
}

document.addEventListener("DOMContentLoaded", iniciarGestao);
