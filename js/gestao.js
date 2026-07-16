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

  painel.addEventListener("click", tratarAcao);
}

document.addEventListener("DOMContentLoaded", iniciarGestao);
