// ============================================================
// ATENÇÃO: isto NÃO é um sistema de login.
// É apenas uma trava simples no navegador para evitar que a
// página seja aberta por acaso. Qualquer pessoa que veja o
// código-fonte pode descobrir o código. A proteção de verdade
// dos dados precisa vir das políticas de RLS no Supabase.
// Veja o README.md antes de usar em produção.
// ============================================================
const CODIGO_ACESSO = "cg2026"; // troque este código

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

function iniciarGestao() {
  const painel = document.getElementById("painel-gestao");
  const portao = document.getElementById("portao-acesso");
  if (!painel) return;

  const formAcesso = document.getElementById("form-acesso");
  formAcesso.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const valor = document.getElementById("codigo-acesso").value.trim();
    if (valor === CODIGO_ACESSO) {
      portao.hidden = true;
      painel.hidden = false;
      carregarPedidos();
    } else {
      document.getElementById("acesso-erro").hidden = false;
    }
  });

  painel.addEventListener("click", tratarAcao);
}

document.addEventListener("DOMContentLoaded", iniciarGestao);
