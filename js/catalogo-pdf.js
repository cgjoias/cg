// ============================================================
// CATÁLOGO EM PDF
// Gera, direto no navegador, um PDF com TODOS os produtos do site
// (os mesmos que aparecem no catálogo, lidos do Supabase / produtos.json).
//
//   Capa  → logo + índice por categoria (cada botão leva à sua página)
//   Miolo → 2 peças por página: foto, nome, especificações, numerações
//           e o botão "Clique aqui para escolher este modelo"
//           (abre o pedido dessa peça no site)
//
// Para mudar contato, cores ou mostrar preços, edite o bloco CFG abaixo.
// ============================================================
(function () {
  "use strict";

  const CFG = {
    nomeLoja: "CG ACESSÓRIOS",
    whatsappDigitos: "5591991592137",
    whatsappTexto: "(91) 99159-2137",
    whatsappMensagem: "Olá! Vi o catálogo em PDF da CG Acessórios e gostaria de saber mais.",
    instagramUrl: "https://www.instagram.com/lojacg.oficial",
    instagramTexto: "@lojacg.oficial",
    email: "lojacg.contato@gmail.com",

    logoCapa: "assets/img/marca/logo-capa.jpg", // logo sobre fundo rosa, usada na capa
    icones: { // PNGs do rodapé e do botão (cada um com hiperlink dentro do PDF)
      whatsapp: "assets/img/pdf/whatsapp.png",
      instagram: "assets/img/pdf/instagram.png",
      email: "assets/img/pdf/email.png",
    },
    // Tamanho (pt) de cada ícone no rodapé. Não são iguais de propósito: o PNG do WhatsApp tem
    // uma borda cinza-clara que "come" ~20% da figura, e o do Gmail é retangular (4:3).
    // Com estes valores os três ficam com o MESMO peso visual (~26 pt).
    tamanhoIcones: { whatsapp: 33, instagram: 26, email: 30 },
    mostrarPrecos: false, // false = "Valores sob consulta" (igual ao modelo). true = imprime Par/Unidade/Trio

    // ordem das categorias no PDF (as que não estiverem aqui vão depois, em ordem alfabética)
    ordemCategorias: ["aliancas", "aneis", "solitarios", "colares", "brincos", "pulseiras"],
    nomesCategorias: {
      aliancas: "Alianças",
      aneis: "Anéis",
      solitarios: "Solitários",
      colares: "Colares",
      brincos: "Brincos",
      pulseiras: "Pulseiras",
    },
    // categorias em que o tamanho é "numeração" (as demais dizem "Tamanhos disponíveis")
    categoriasComNumeracao: ["aliancas", "aneis", "solitarios"],

    // biblioteca de PDF (carregada só quando alguém clica em "Baixar catálogo")
    jspdfUrls: [
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
    ],

    cor: {
      rosa: [255, 226, 246], // faixa do topo (igual ao fundo da logo)
      marrom: [122, 82, 24], // títulos, links, botão
      botao: [120, 84, 25],
      texto: [34, 34, 34],
      texto2: [70, 70, 70],
      cinza: [120, 120, 120],
      borda: [236, 221, 227],
      verdeFundo: [238, 246, 236],
      verdeTexto: [46, 107, 63],
      linha: [230, 224, 227],
    },
  };

  // ---------- medidas (pontos, A4 retrato) ----------
  const PW = 595.28;
  const PH = 841.89;
  const MARGEM = 40;
  const CARD = { x: 33.5, w: 528, h: 312, y0: 96, passo: 330 };

  // ---------- utilidades ----------
  const limpar = (t) =>
    String(t == null ? "" : t)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[^\u0000-\u00FF]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const moeda = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function dataHoraBrasilia() {
    const partes = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const g = (t) => (partes.find((p) => p.type === t) || {}).value || "";
    const hora = g("hour") === "24" ? "00" : g("hour");
    return {
      texto: `${g("day")}/${g("month")}/${g("year")}, ${hora}:${g("minute")}:${g("second")}`,
      arquivo: `${g("year")}-${g("month")}-${g("day")}`,
    };
  }

  function nomeCategoria(id) {
    if (CFG.nomesCategorias[id]) return CFG.nomesCategorias[id];
    const s = String(id || "Outros");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function urlAbsoluta(relativa) {
    try { return new URL(relativa, document.baseURI).href; } catch (e) { return relativa; }
  }

  // ---------- carregar biblioteca e imagens ----------
  function carregarScript(url) {
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => erro(new Error("falha ao carregar " + url));
      document.head.appendChild(s);
    });
  }

  async function garantirJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    for (const url of CFG.jspdfUrls) {
      try {
        await carregarScript(url);
        if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
      } catch (e) { /* tenta o próximo endereço */ }
    }
    throw new Error("Não foi possível carregar a biblioteca de PDF. Verifique a internet e tente de novo.");
  }

  function carregarImagem(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // recorta a foto em quadrado (centro) e comprime em JPEG — PDF leve
  async function fotoQuadrada(url, lado, qualidade) {
    const img = await carregarImagem(url);
    if (!img || !img.naturalWidth) return null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, lado, lado);
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - s) / 2;
      const sy = (img.naturalHeight - s) / 2;
      g.drawImage(img, sx, sy, s, s, 0, 0, lado, lado);
      return c.toDataURL("image/jpeg", qualidade);
    } catch (e) {
      return null; // imagem de outro site sem permissão (CORS)
    }
  }

  async function imagemComoJpeg(url) {
    const img = await carregarImagem(url);
    if (!img || !img.naturalWidth) return null;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      return { dados: c.toDataURL("image/jpeg", 0.92), w: c.width, h: c.height };
    } catch (e) {
      return null;
    }
  }

  // PNG com transparência (ícones). Devolve { dados, w, h } ou null.
  async function imagemComoPng(url) {
    const img = await carregarImagem(url);
    if (!img || !img.naturalWidth) return null;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      return { dados: c.toDataURL("image/png"), w: c.width, h: c.height };
    } catch (e) {
      return null;
    }
  }

  // desenha o ícone dentro de uma caixa (sem deformar) e já põe o hiperlink
  function iconeComLink(doc, ic, x, y, caixa, link) {
    if (!ic) return;
    const r = Math.min(caixa / ic.w, caixa / ic.h);
    const w = ic.w * r;
    const h = ic.h * r;
    doc.addImage(ic.dados, "PNG", x + (caixa - w) / 2, y + (caixa - h) / 2, w, h, undefined, "FAST");
    doc.link(x, y, caixa, caixa, link);
  }

  function linkWhatsapp(mensagem) {
    return { url: `https://wa.me/${CFG.whatsappDigitos}?text=${encodeURIComponent(mensagem)}` };
  }

  // ---------- dados ----------
  function agruparPorCategoria(produtos) {
    const mapa = new Map();
    produtos.forEach((p) => {
      const id = p.categoria || "outros";
      if (!mapa.has(id)) mapa.set(id, []);
      mapa.get(id).push(p);
    });
    const ids = Array.from(mapa.keys());
    const pos = (id) => {
      const i = CFG.ordemCategorias.indexOf(id);
      return i === -1 ? 999 : i;
    };
    ids.sort((a, b) => pos(a) - pos(b) || nomeCategoria(a).localeCompare(nomeCategoria(b), "pt-BR"));
    return ids.map((id) => ({ id, nome: nomeCategoria(id), itens: mapa.get(id) }));
  }

  function textoCodigo(p) {
    const c = limpar(p.codigo);
    if (!c || /^sob consulta$/i.test(c)) return "";
    return c.replace(/\s*[|;]\s*/g, " / ");
  }

  function linhasSpec(p) {
    const campos = [
      ["Acabamento", p.acabamento],
      ["Largura", p.largura],
      ["Cor", p.cor],
      ["Formato Externo", p.formato],
      ["Pedra", p.pedra],
      ["Detalhes", p.detalhes],
    ];
    return campos.filter(([, v]) => limpar(v)).map(([r, v]) => `${r}: ${limpar(v)}`);
  }

  // separa "AL034F | AL034M" em { fem: "AL034F", masc: "AL034M" }
  function codigosFM(p) {
    const partes = String(p.codigo || "").split(/[|/;,]/).map((s) => limpar(s)).filter(Boolean);
    return {
      fem: partes.find((c) => /F$/i.test(c)) || "",
      masc: partes.find((c) => /M$/i.test(c)) || "",
    };
  }

  function grupoTamanhos(p) {
    const lista = (v) => (Array.isArray(v) ? v.map(limpar).filter(Boolean) : []);
    const fem = lista(p.tamanhosFeminino);
    const masc = lista(p.tamanhosMasculino);
    const geral = lista(p.tamanhos);
    const titulo = CFG.categoriasComNumeracao.includes(p.categoria) ? "Numerações disponíveis" : "Tamanhos disponíveis";
    const linhas = [];
    if (fem.length || masc.length) {
      const cod = codigosFM(p);
      if (fem.length) linhas.push(`Feminina${cod.fem ? ` (${cod.fem})` : ""}: ${fem.join(" · ")}`);
      if (masc.length) linhas.push(`Masculina${cod.masc ? ` (${cod.masc})` : ""}: ${masc.join(" · ")}`);
    } else if (geral.length) {
      linhas.push(geral.join(" · "));
    }
    return { titulo, linhas };
  }

  function linhasPreco(p) {
    if (!CFG.mostrarPrecos) return [];
    if (Array.isArray(p.precos) && p.precos.length) {
      return [p.precos.map((o) => `${limpar(o.rotulo)}: ${moeda(o.valor)}`).join(" · ")];
    }
    return Number(p.preco) > 0 ? [moeda(p.preco)] : [];
  }

  // ---------- desenho ----------
  function cor(doc, c, tipo) {
    if (tipo === "fill") doc.setFillColor(c[0], c[1], c[2]);
    else if (tipo === "draw") doc.setDrawColor(c[0], c[1], c[2]);
    else doc.setTextColor(c[0], c[1], c[2]);
  }

  function rodape(doc, num, total, icones) {
    const y = 766;
    cor(doc, CFG.cor.linha, "draw");
    doc.setLineWidth(0.8);
    doc.line(MARGEM, y, PW - MARGEM, y);

    // ícones (PNG) com hiperlink: WhatsApp, Instagram e e-mail — centralizados na mesma linha
    const yc = y + 26;
    const T = CFG.tamanhoIcones;
    const lista = [
      { ic: icones.whatsapp, t: T.whatsapp, cx: 53, link: linkWhatsapp(CFG.whatsappMensagem) },
      { ic: icones.instagram, t: T.instagram, cx: 92.5, link: { url: CFG.instagramUrl } },
      { ic: icones.email, t: T.email, cx: 133.5, link: { url: `mailto:${CFG.email}` } },
    ];
    lista.forEach((i) => iconeComLink(doc, i.ic, i.cx - i.t / 2, yc - i.t / 2, i.t, i.link));

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const xDir = PW - MARGEM - 53;
    cor(doc, CFG.cor.marrom);
    doc.text("Início", xDir, y + 24);
    doc.link(xDir, y + 14, doc.getTextWidth("Início"), 13, { pageNumber: 1 });
    cor(doc, CFG.cor.texto);
    doc.text(`${num} / ${total}`, xDir, y + 43);
  }

  function faixaTopo(doc, subtitulo) {
    cor(doc, CFG.cor.rosa, "fill");
    doc.rect(0, 0, PW, 71.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);
    cor(doc, CFG.cor.marrom);
    doc.text(CFG.nomeLoja, MARGEM, 32);
    doc.setFontSize(9.5);
    cor(doc, CFG.cor.texto);
    doc.text(limpar(subtitulo), MARGEM, 54);
  }

  function textoGerado(doc, texto, y) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    cor(doc, CFG.cor.cinza);
    doc.text(texto, MARGEM, y);
  }

  // Coluna da direita (nome, material, especificações, numerações).
  // "desenhar = false" só mede a altura (para reduzir a letra se não couber).
  function colunaDireita(doc, p, x, y, largura, escala, desenhar) {
    const e = escala;
    let cy = y;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12 * e);
    const titulo = doc.splitTextToSize(limpar(p.nome), largura);
    cy += 12 * e;
    if (desenhar) { cor(doc, CFG.cor.texto); doc.text(titulo, x, cy); }
    cy += (titulo.length - 1) * 13.6 * e + 19 * e;

    const material = limpar(p.material);
    if (material) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5 * e);
      if (desenhar) { cor(doc, CFG.cor.marrom); doc.text(doc.splitTextToSize(material, largura), x, cy); }
      cy += 13.5 * e;
    }

    const specs = linhasSpec(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6 * e);
    specs.forEach((linha) => {
      const partes = doc.splitTextToSize(linha, largura);
      if (desenhar) { cor(doc, CFG.cor.texto2); doc.text(partes, x, cy); }
      cy += partes.length * 10.9 * e;
    });

    // sem especificações cadastradas (ex.: colares): usa a descrição
    if (specs.length < 2 && limpar(p.descricao)) {
      const desc = doc.splitTextToSize(limpar(p.descricao), largura);
      const uso = desc.slice(0, 6);
      if (desenhar) { cor(doc, CFG.cor.texto2); doc.text(uso, x, cy + 2 * e); }
      cy += uso.length * 10.9 * e + 4 * e;
    }

    cy += 6 * e;

    const grupo = grupoTamanhos(p);
    const extras = linhasPreco(p);
    if (grupo.linhas.length || extras.length) {
      const bx = x - 8;
      const bw = largura + 8 + 2;
      const larguraTexto = bw - 16;
      let altura = 8 * e;
      const blocos = [];
      if (grupo.linhas.length) {
        blocos.push({ tipo: "tit", texto: grupo.titulo, altura: 12.5 * e });
        altura += 12.5 * e;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.4 * e);
        grupo.linhas.forEach((l) => {
          const partes = doc.splitTextToSize(l, larguraTexto);
          blocos.push({ tipo: "lin", partes, altura: partes.length * 11.4 * e + 3 * e });
          altura += partes.length * 11.4 * e + 3 * e;
        });
      }
      if (extras.length) {
        blocos.push({ tipo: "tit", texto: "Valores", altura: 12.5 * e });
        altura += 12.5 * e;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.4 * e);
        extras.forEach((l) => {
          const partes = doc.splitTextToSize(l, larguraTexto);
          blocos.push({ tipo: "lin", partes, altura: partes.length * 11.4 * e + 3 * e });
          altura += partes.length * 11.4 * e + 3 * e;
        });
      }
      altura += 3 * e;
      if (desenhar) {
        cor(doc, CFG.cor.verdeFundo, "fill");
        doc.roundedRect(bx, cy, bw, altura, 7, 7, "F");
        let ty = cy + 6 * e;
        blocos.forEach((b) => {
          if (b.tipo === "tit") {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10.2 * e);
            cor(doc, CFG.cor.verdeTexto);
            doc.text(limpar(b.texto), bx + 8, ty + 8.5 * e);
          } else {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.4 * e);
            cor(doc, CFG.cor.texto);
            doc.text(b.partes, bx + 8, ty + 8.5 * e);
          }
          ty += b.altura;
        });
      }
      cy += altura;
    }
    return cy;
  }

  function desenharCard(doc, p, fotos, yTopo, icones) {
    // moldura
    cor(doc, CFG.cor.borda, "draw");
    doc.setLineWidth(1);
    doc.roundedRect(CARD.x, yTopo, CARD.w, CARD.h, 9, 9, "S");

    // foto
    const fx = CARD.x + 8.4;
    const fy = yTopo + 13.5;
    const lado = 233;
    const dados = fotos.get(p.id);
    if (dados) {
      doc.addImage(dados, "JPEG", fx, fy, lado, lado, undefined, "FAST");
    } else {
      cor(doc, CFG.cor.rosa, "fill");
      doc.rect(fx, fy, lado, lado, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      cor(doc, CFG.cor.cinza);
      doc.text("Foto indisponível", fx + lado / 2, fy + lado / 2, { align: "center" });
    }

    // código
    const cod = textoCodigo(p);
    if (cod) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      cor(doc, CFG.cor.marrom);
      doc.text(cod, fx + 6, yTopo + 263);
    }

    // botão: abre o WhatsApp já falando desta peça
    const bx = fx + 3;
    const by = yTopo + 274.5;
    const bw = lado - 3;
    const bh = 28.5;
    cor(doc, CFG.cor.botao, "fill");
    doc.roundedRect(bx, by, bw, bh, 5, 5, "F");
    if (icones.whatsapp) {
      const ic = icones.whatsapp;
      const r = Math.min(20 / ic.w, 20 / ic.h);
      doc.addImage(ic.dados, "PNG", bx + 12, by + (bh - ic.h * r) / 2, ic.w * r, ic.h * r, undefined, "FAST");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(255, 255, 255);
    doc.text("Clique aqui para falar no WhatsApp", bx + 40, by + bh / 2 + 3);
    const cod2 = textoCodigo(p);
    const msg = `Olá! Vi o catálogo da CG Acessórios e tenho interesse nesta peça: ${limpar(p.nome)}${cod2 ? ` (Cód.: ${cod2})` : ""}.`;
    doc.link(bx, by, bw, bh, linkWhatsapp(msg));

    // coluna direita — reduz a letra só se o conteúdo não couber
    const cx = 292;
    const larg = CARD.x + CARD.w - 8 - cx;
    const yIni = yTopo + 16;
    const limite = yTopo + CARD.h - 10;
    let escala = 1;
    while (escala > 0.7 && colunaDireita(doc, p, cx, yIni, larg, escala, false) > limite) escala -= 0.05;
    colunaDireita(doc, p, cx, yIni, larg, escala, true);
  }

  function desenharCapa(doc, ctx) {
    const { categorias, paginaInicial, total, logo, geradoEm, icones } = ctx;

    // faixa rosa + logo
    cor(doc, CFG.cor.rosa, "fill");
    doc.rect(0, 0, PW, 343, "F");
    if (logo) {
      const lado = 300;
      doc.addImage(logo.dados, "JPEG", (PW - lado) / 2, 30, lado, lado, undefined, "FAST");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);
    cor(doc, CFG.cor.marrom);
    doc.text(CFG.nomeLoja, MARGEM, 32);
    doc.setFontSize(9.5);
    cor(doc, CFG.cor.texto);
    const nomes = categorias.map((c) => c.nome.toLowerCase());
    const lista = nomes.length > 1 ? nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1] : nomes[0] || "";
    doc.text(limpar(`Catálogo de ${lista}`), MARGEM, 54);

    // título e texto
    doc.setFontSize(23);
    cor(doc, CFG.cor.marrom);
    doc.text("Encontre o seu próximo modelo", 70.9, 382);

    doc.setFontSize(9.3);
    cor(doc, CFG.cor.texto2);
    const intro = doc.splitTextToSize(
      "Toque no botão de cada modelo para falar com a gente no WhatsApp, ou tire um print e envie. Toque em uma categoria para navegar.",
      453
    );
    doc.text(intro, 70.9, 412);

    // botões de categoria (cada um leva à sua primeira página)
    const n = Math.max(categorias.length, 1);
    const inicio = 448;
    const disponivel = 205;
    const passo = Math.min(59.5, disponivel / n);
    const alt = Math.min(45, passo * 0.76);
    categorias.forEach((c, i) => {
      const y = inicio + i * passo;
      cor(doc, CFG.cor.rosa, "fill");
      doc.roundedRect(70.9, y, 453.6, alt, 10, 10, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(alt >= 40 ? 12.5 : 11);
      cor(doc, CFG.cor.marrom);
      doc.text(limpar(c.nome), 90, y + alt / 2 + 4.3);
      doc.link(70.9, y, 453.6, alt, { pageNumber: paginaInicial[c.id] });
    });

    const yFim = inicio + n * passo + 8;
    doc.setFontSize(9);
    cor(doc, CFG.cor.texto);
    doc.text(`Gerado em ${geradoEm} (horário de Brasília)`, 70.9, yFim + 14);
    doc.setFontSize(8.5);
    cor(doc, CFG.cor.cinza);
    doc.text("Disponibilidade consultada no momento da geração.", 70.9, yFim + 32);
    doc.text(CFG.mostrarPrecos ? "Estoque sujeito a alterações." : "Estoque sujeito a alterações. Valores sob consulta.", 70.9, yFim + 43);

    rodape(doc, 1, total, icones);
  }

  // ---------- principal ----------
  async function gerarCatalogoPDF(aoProgredir) {
    const avisar = (t) => { if (aoProgredir) aoProgredir(t); };

    avisar("Carregando produtos…");
    const produtos = (await window.carregarProdutosSite()).filter((p) => p && p.id);
    if (!produtos.length) throw new Error("Não há produtos para colocar no catálogo.");

    avisar("Preparando o PDF…");
    const JsPDF = await garantirJsPDF();
    const categorias = agruparPorCategoria(produtos);

    // páginas: capa + (2 peças por página, cada categoria começa em página nova)
    const paginas = [];
    const paginaInicial = {};
    categorias.forEach((c) => {
      paginaInicial[c.id] = paginas.length + 2;
      for (let i = 0; i < c.itens.length; i += 2) {
        paginas.push({ categoria: c, itens: c.itens.slice(i, i + 2) });
      }
    });
    const total = paginas.length + 1;

    // fotos (4 de cada vez)
    const fotos = new Map();
    let feitas = 0;
    const fila = produtos.slice();
    async function trabalhador() {
      while (fila.length) {
        const p = fila.shift();
        const capa = p.imagem || (Array.isArray(p.imagens) && p.imagens[0]);
        const dados = capa ? await fotoQuadrada(capa, 720, 0.82) : null;
        fotos.set(p.id, dados);
        feitas += 1;
        avisar(`Preparando fotos… ${feitas}/${produtos.length}`);
      }
    }
    await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
    const logo = await imagemComoJpeg(CFG.logoCapa);
    const icones = {
      whatsapp: await imagemComoPng(CFG.icones.whatsapp),
      instagram: await imagemComoPng(CFG.icones.instagram),
      email: await imagemComoPng(CFG.icones.email),
    };

    avisar("Montando o PDF…");
    const doc = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    doc.setProperties({ title: "CG Acessórios - Catálogo", author: "CG Acessórios", subject: "Catálogo de produtos" });
    const geradoEm = dataHoraBrasilia();

    desenharCapa(doc, { categorias, paginaInicial, total, logo, geradoEm: geradoEm.texto, icones });

    paginas.forEach((pg, i) => {
      doc.addPage();
      faixaTopo(doc, pg.categoria.nome);
      pg.itens.forEach((p, k) => desenharCard(doc, p, fotos, CARD.y0 + k * CARD.passo, icones));
      textoGerado(doc, `Gerado em ${geradoEm.texto} - horário de Brasília`, 750);
      rodape(doc, i + 2, total, icones);
    });

    doc.save(`CG-ACESSORIOS-catalogo-${geradoEm.arquivo}.pdf`);
    return { paginas: total, produtos: produtos.length };
  }

  window.gerarCatalogoPDF = gerarCatalogoPDF;

  // ---------- botão na página do catálogo ----------
  function ligarBotao() {
    const botao = document.getElementById("btn-baixar-catalogo-pdf");
    if (!botao) return;
    const status = document.getElementById("catalogo-pdf-status");
    const rotuloOriginal = botao.textContent;
    let ocupado = false;

    botao.addEventListener("click", async () => {
      if (ocupado) return;
      ocupado = true;
      botao.disabled = true;
      if (status) status.textContent = "";
      try {
        const r = await gerarCatalogoPDF((t) => { botao.textContent = t; });
        if (status) status.textContent = `Pronto! ${r.produtos} peças em ${r.paginas} páginas.`;
      } catch (erro) {
        console.error("Erro ao gerar o catálogo em PDF:", erro);
        if (status) status.textContent = erro && erro.message ? erro.message : "Não foi possível gerar o PDF agora.";
      } finally {
        botao.textContent = rotuloOriginal;
        botao.disabled = false;
        ocupado = false;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligarBotao);
  else ligarBotao();
})();
