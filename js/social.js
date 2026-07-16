// ============================================================
// REDES SOCIAIS
// Cria o botão flutuante do WhatsApp e preenche os ícones e a lista
// por extenso de redes sociais do rodapé com base em js/config.js.
// ============================================================
function formatarTelefoneBR(numeroDigitos) {
  // Espera algo como "5551999999999" (55 + DDD + número) e devolve "(51) 99999-9999".
  const semDDI = numeroDigitos.length > 11 ? numeroDigitos.slice(-11) : numeroDigitos;
  const ddd = semDDI.slice(0, 2);
  const resto = semDDI.slice(2);
  if (resto.length === 9) return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
  if (resto.length === 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  return numeroDigitos;
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof LOJA === "undefined") return;

  const numero = (LOJA.whatsapp || "").replace(/\D/g, "");
  const mensagem = encodeURIComponent(LOJA.whatsappMensagem || "Olá!");
  const linkWhatsapp = numero ? `https://wa.me/${numero}?text=${mensagem}` : null;

  // Botão flutuante do WhatsApp (em todas as páginas)
  if (linkWhatsapp) {
    const botao = document.createElement("a");
    botao.href = linkWhatsapp;
    botao.target = "_blank";
    botao.rel = "noopener";
    botao.className = "whatsapp-float";
    botao.setAttribute("aria-label", "Falar no WhatsApp");
    botao.innerHTML = '<img src="assets/img/imagens/whatsapp.png" alt="WhatsApp">';
    document.body.appendChild(botao);
  }

  // Lista de contato no rodapé: selo circular com ícone SVG + a PALAVRA do
  // canal, já como hiperlink. Sem número, sem @usuário, sem endereço
  // escrito — só o link. Ícones inline (não <img>) para poder colorir e
  // dar efeito de hover via CSS.
  const ICONES = {
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5a8.2 8.2 0 0 0-7.1 12.3L4 20.5l4.8-1.3A8.2 8.2 0 1 0 12 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.9 8.7c-.2.4-.5 1.1-.4 1.7.2 1.2 1 2.5 2 3.4 1 .9 2.3 1.6 3.5 1.7.6.1 1.3-.2 1.7-.5.3-.2.4-.6.3-1l-.2-.6c-.1-.3-.4-.5-.7-.6l-1.2-.4c-.3-.1-.6 0-.8.2l-.4.4c-.6-.2-1.2-.6-1.7-1.1-.5-.5-.9-1.1-1.1-1.7l.4-.4c.2-.2.3-.5.2-.8l-.4-1.2c-.1-.3-.3-.5-.6-.6Z" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="5.5" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.6"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.6 21v-7.2h2.4l.4-2.8h-2.8V9.2c0-.8.2-1.3 1.4-1.3h1.5V5.4c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7v2h-2.4v2.8h2.4V21h2.8Z" fill="currentColor"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5.5" width="18" height="13" rx="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M4 7.2l8 5.8 8-5.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  const alvoContato = document.getElementById("foot-contato");
  if (alvoContato) {
    const linhas = [];
    if (linkWhatsapp) {
      linhas.push(`<li><a class="rotulo" href="${linkWhatsapp}" target="_blank" rel="noopener"><span class="rotulo-icone">${ICONES.whatsapp}</span>WhatsApp</a></li>`);
    }
    if (LOJA.instagram) {
      linhas.push(`<li><a class="rotulo" href="${LOJA.instagram}" target="_blank" rel="noopener"><span class="rotulo-icone">${ICONES.instagram}</span>Instagram</a></li>`);
    }
    if (LOJA.facebook) {
      linhas.push(`<li><a class="rotulo" href="${LOJA.facebook}" target="_blank" rel="noopener"><span class="rotulo-icone">${ICONES.facebook}</span>Facebook</a></li>`);
    }
    if (LOJA.email) {
      linhas.push(`<li><a class="rotulo" href="mailto:${LOJA.email}"><span class="rotulo-icone">${ICONES.email}</span>E-mail</a></li>`);
    }
    alvoContato.innerHTML = linhas.join("");
  }
});
