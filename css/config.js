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
// ============================================================
// FRETE ESTIMADO POR ESTADO (sem depender de Correios/Melhor Envio)
// Baseado num pacote padrão de semijoia, saindo de Belém/PA.
// São valores ESTIMADOS — ajuste livremente os números abaixo
// depois de comparar com o custo real das primeiras postagens.
// ============================================================
const FRETE_BELEM_CAPITAL = 22.50; // Belém e região metropolitana
const FRETE_POR_UF = {
  PA: 32.80, // interior do Pará
  AP: 38.50,
  MA: 39.20,
  TO: 39.20,
  PI: 45.90,
  CE: 45.90,
  RN: 45.90,
  PB: 45.90,
  PE: 45.90,
  AL: 45.90,
  SE: 45.90,
  BA: 45.90,
  DF: 48.00,
  GO: 48.00,
  MT: 48.00,
  MS: 48.00,
  SP: 52.50,
  RJ: 52.50,
  MG: 54.00,
  ES: 54.00,
  PR: 84.80, // Sul: 59,80 + R$ 25 (região mais distante de Belém)
  SC: 84.80,
  RS: 84.80,
  AM: 64.00,
  RR: 64.00,
  RO: 64.00,
  AC: 64.00,
};
const FRETE_PADRAO = 60.00; // se por algum motivo o estado não for reconhecido

const EMAILJS_CONFIG = {
  publicKey: "iRbeGv5Qmk60RrQDj",
  serviceId: "service_dxaj3zc",
  templateId: "template_5lm8p5n",
};
