// ============================================================
// AVISO DE NOVO PEDIDO POR E-MAIL (EmailJS, via API REST — sem SDK)
// Chamado por pedido.js logo depois que o pedido é salvo no banco.
// Se der qualquer erro aqui, o cliente NÃO percebe: o pedido já foi
// salvo e a tela de resumo abre normalmente.
// ============================================================
(function () {
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function numeroWhats(bruto) {
    let n = String(bruto || "").replace(/\D/g, "").replace(/^0+/, "");
    if (n.length === 10 || n.length === 11) n = "55" + n;
    return n;
  }

  async function enviar(pedido) {
    if (typeof EMAILJS_CONFIG === "undefined") return;
    const { publicKey, serviceId, templateId } = EMAILJS_CONFIG;
    if (!publicKey || !serviceId || !templateId) return; // alerta desligado

    const itens = pedido.itens || [];
    const total = itens.reduce((s, i) => s + Number(i.preco || 0), 0);
    const params = {
      cliente: pedido.nome || "",
      whatsapp: pedido.whatsapp || "",
      whatsapp_link: `https://wa.me/${numeroWhats(pedido.whatsapp)}`,
      endereco: pedido.endereco || "A combinar",
      observacoes: pedido.observacoes || "—",
      qtd_pecas: String(itens.length),
      pecas: itens.map((i) => `• ${i.nome} — ${brl(i.preco)}${i.detalhes ? " (" + i.detalhes + ")" : ""}`).join("\n"),
      total: brl(total),
      data: new Date().toLocaleString("pt-BR"),
      link_gestao: new URL("gestao.html", window.location.href).href,
    };

    try {
      await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true, // deixa o envio terminar mesmo se a página mudar
        body: JSON.stringify({ service_id: serviceId, template_id: templateId, user_id: publicKey, template_params: params }),
      });
    } catch (e) {
      console.warn("Alerta de pedido por e-mail não enviado:", e);
    }
  }

  // Espera no máximo 2,5 s pra não atrasar o cliente.
  window.notificarPedido = (pedido) =>
    Promise.race([enviar(pedido), new Promise((ok) => setTimeout(ok, 2500))]);
})();
