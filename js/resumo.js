function formatarPreco(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function montarLinhas(pedido) {
  return [
    ["Nome", pedido.nome],
    ["WhatsApp", pedido.whatsapp],
    ["Endereço", pedido.endereco || "A combinar"],
    ["Peça", pedido.produto_nome],
    ["Valor", formatarPreco(pedido.preco)],
    ["Detalhes (tamanho/cor)", pedido.detalhes || "—"],
    ["Observações", pedido.observacoes || "—"],
  ];
}

function montarMensagemWhatsApp(pedido) {
  const linhas = montarLinhas(pedido).map(([rotulo, valor]) => `*${rotulo}:* ${valor}`);
  const texto = [`Olá! Gostaria de confirmar meu pedido em ${LOJA.nome}:`, "", ...linhas].join("\n");
  return `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(texto)}`;
}

function iniciarResumo() {
  const container = document.getElementById("resumo-conteudo");
  const vazio = document.getElementById("resumo-vazio");
  if (!container) return;

  const bruto = sessionStorage.getItem("ultimoPedido");
  if (!bruto) {
    container.hidden = true;
    vazio.hidden = false;
    return;
  }

  const pedido = JSON.parse(bruto);
  const lista = document.getElementById("resumo-lista");
  lista.innerHTML = "";
  montarLinhas(pedido).forEach(([rotulo, valor]) => {
    const item = document.createElement("p");
    item.innerHTML = `<strong>${rotulo}:</strong> ${valor}`;
    lista.appendChild(item);
  });

  document.getElementById("link-whatsapp").href = montarMensagemWhatsApp(pedido);

  document.getElementById("botao-pdf").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(LOJA.nome, 105, 25, { align: "center" });

    doc.setFontSize(13);
    doc.text("Resumo do Pedido", 105, 36, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    let y = 55;
    montarLinhas(pedido).forEach(([rotulo, valor]) => {
      doc.text(`${rotulo}: ${valor}`, 20, y);
      y += 10;
    });

    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, 20, y + 6);
    doc.save("pedido.pdf");
  });
}

document.addEventListener("DOMContentLoaded", iniciarResumo);
