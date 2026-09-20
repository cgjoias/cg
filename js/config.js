// ============================================================
// CONFIGURAÇÃO DA LOJA
// Edite estes valores para personalizar o site sem mexer no
// resto do código.
// ============================================================
const LOJA = {
  nome: "CG Acessórios",
  whatsapp: "5551999999999", // formato: DDI + DDD + número, só dígitos — troque pelo número real
  whatsappMensagem: "Olá! Vim do site da CG Acessórios e gostaria de saber mais.",
  instagram: "https://www.instagram.com/lojacg.oficial",
  instagramHandle: "@lojacg.oficial",
  facebook: "https://www.facebook.com/lojacg.oficial", // confirme se este é o endereço real
  email: "contato@cgacessorios.com.br", // troque pelo e-mail real
};

// Opções de tamanho/cor mostradas como "caixinhas" clicáveis no formulário
// de pedido, de acordo com a categoria da peça escolhida. Edite livremente:
// adicione, remova ou renomeie as opções de cada categoria.
// Se um produto específico precisar de opções diferentes do padrão da
// categoria, adicione um campo "variacoes": ["Opção 1", "Opção 2"] nele
// dentro de data/produtos.json — isso substitui a lista abaixo só pra ele.
const VARIACOES_POR_CATEGORIA = {
  aliancas: {
    rotulo: "Aro (tamanho)",
    opcoes: ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33"],
  },
  aneis: {
    rotulo: "Aro (tamanho)",
    opcoes: ["14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24"],
  },
  colares: {
    rotulo: "Comprimento",
    opcoes: ["40 cm", "45 cm", "50 cm", "60 cm"],
  },
  brincos: {
    rotulo: "Cor",
    opcoes: ["Dourado", "Prateado", "Rosé"],
  },
  pulseiras: {
    rotulo: "Comprimento",
    opcoes: ["16 cm", "18 cm", "20 cm"],
  },
};

// ============================================================
// ALERTA DE NOVO PEDIDO POR E-MAIL (EmailJS)
// Deixe os três campos vazios para desligar o alerta.
// Passo a passo em: LEIA-ME-EMAILJS.md
//   publicKey  -> emailjs.com > Account > General > Public Key
//   serviceId  -> emailjs.com > Email Services (ex.: "service_abc123")
//   templateId -> emailjs.com > Email Templates (ex.: "template_xyz789")
// Essas chaves são públicas por natureza (ficam no navegador).
// Proteja-as em EmailJS > Security > "Allowed domains" (só o seu site).
// ============================================================
const EMAILJS_CONFIG = {
  publicKey: "iRbeGv5Qmk60RrQDj",
  serviceId: "service_dxaj3zc",
  templateId: "template_5lm8p5n",
};
