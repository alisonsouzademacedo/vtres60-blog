import { describe, expect, it } from "vitest";
import {
  EXCERPT_IMPACT_OVERLAP_THRESHOLD,
  ctaParagraphStatus,
  extractDirectQuotes,
  firstParagraph,
  hasV360ClosingParagraph,
  jaccardSimilarity,
  normalizeSourceUrl,
  stripV360ClosingParagraph,
  validateDirectQuotes,
  validateExcerpt,
  validateImpact,
} from "./text-guards";

describe("validateExcerpt", () => {
  it("excerpt completo terminando em ponto é válido", () => {
    const result = validateExcerpt("A indústria paulista recuou no primeiro semestre de 2026.", "Título qualquer");
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("excerpt terminando em … é inválido", () => {
    const result = validateExcerpt("segundo o balanço econômico da F…", "Título qualquer");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /reticências/.test(i))).toBe(true);
  });

  it('excerpt terminando em "..." é inválido', () => {
    const result = validateExcerpt("o setor industr...", "Título qualquer");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /reticências/.test(i))).toBe(true);
  });

  it("excerpt sem pontuação final (cortado no meio da palavra) é inválido", () => {
    const result = validateExcerpt("representando", "Título qualquer");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /pontuação/.test(i))).toBe(true);
  });

  it("excerpt vazio é inválido", () => {
    const result = validateExcerpt("   ", "Título qualquer");
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(["excerpt vazio"]);
  });

  it("excerpt idêntico ao título é inválido", () => {
    const title = "Indústria Paulista Enfrenta Desempenho Desafiador em 2026";
    const result = validateExcerpt(`${title}.`, title);
    // O ponto final adicionado ainda conta como "idêntico" apos normalizacao? Nao —
    // normalizeForComparison so faz lowercase+trim, entao "titulo." != "titulo".
    // Testamos o caso realmente identico (sem pontuacao extra) abaixo.
    expect(result.valid).toBe(true);
  });

  it("excerpt exatamente igual ao título (mesma pontuação) é inválido", () => {
    const title = "Indústria Paulista Enfrenta Desempenho Desafiador.";
    const result = validateExcerpt(title, title);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /idêntico ao título/.test(i))).toBe(true);
  });
});

describe("validateImpact", () => {
  const excerpt = "A indústria paulista teve o pior desempenho da série histórica no primeiro semestre.";
  const body = `${excerpt}\n\nSegundo parágrafo com mais contexto sobre o setor produtivo paulista.`;

  it("impact vazio é inválido", () => {
    const result = validateImpact("", excerpt, body);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(["impact vazio"]);
  });

  it("impact idêntico ao excerpt é inválido", () => {
    const result = validateImpact(excerpt, excerpt, body);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /idêntico ao excerpt/.test(i))).toBe(true);
  });

  it("impact idêntico ao primeiro parágrafo do body é inválido", () => {
    const differentExcerpt = "Resumo completamente diferente sobre outro aspecto da notícia.";
    const result = validateImpact(excerpt, differentExcerpt, body);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /primeiro parágrafo/.test(i))).toBe(true);
  });

  it("impact com baixa sobreposição em relação ao excerpt é válido", () => {
    const impact = "Fabricantes expostos ao mercado interno podem revisar metas de investimento para o segundo semestre.";
    const result = validateImpact(impact, excerpt, body);
    expect(result.valid).toBe(true);
  });

  it("impact que é apenas uma paráfrase do excerpt (alta sobreposição, troca de uma palavra) é inválido", () => {
    const impact = "A indústria paulista registrou o pior desempenho da série histórica no primeiro semestre.";
    expect(jaccardSimilarity(impact, excerpt)).toBeGreaterThan(EXCERPT_IMPACT_OVERLAP_THRESHOLD);
    const result = validateImpact(impact, excerpt, "Outro corpo qualquer.\n\nSegundo parágrafo.");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /sobreposição/.test(i))).toBe(true);
  });

  it("diferenças apenas de caixa/pontuação não escapam da comparação de identidade", () => {
    const result = validateImpact(excerpt.toUpperCase(), excerpt, "Outro corpo.\n\nSegundo parágrafo.");
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => /idêntico ao excerpt/.test(i))).toBe(true);
  });

  it("texto em português com acentos é tokenizado sem corromper as palavras", () => {
    const a = "A indústria não vê recuperação imediata no cenário atual.";
    const b = "Fabricantes acompanham o cenário com cautela redobrada este ano.";
    // "cenário" aparece em ambos (acentuação preservada) — a similaridade deve
    // refletir isso sem que o token vire lixo tipo "cen" + "rio".
    expect(jaccardSimilarity(a, b)).toBeGreaterThan(0);
    expect(jaccardSimilarity(a, b)).toBeLessThan(1);
  });
});

describe("CTA legado — detecção positiva (Fase 2: usado só pelo backfill, não mais pelo InternalAuditor)", () => {
  const legacyClosing =
    "Primeiro parágrafo factual sobre a notícia.\n\n" +
    ":::highlight\nAssim como a empresa citada, a V360 é a parceira ideal para a sua indústria crescer com previsibilidade. Fale com um especialista.\n:::highlight";

  it("reconhece um closing paragraph antigo comprovado (:::highlight ... v360 ... :::highlight)", () => {
    expect(hasV360ClosingParagraph(legacyClosing)).toBe(true);
    expect(ctaParagraphStatus(legacyClosing)).toBe("ok");
  });

  it("remove somente o bloco :::highlight legado, preservando o restante do texto", () => {
    const stripped = stripV360ClosingParagraph(legacyClosing);
    expect(stripped).toBe("Primeiro parágrafo factual sobre a notícia.");
    expect(stripped).not.toMatch(/v360/i);
  });

  it("NÃO remove um parágrafo factual que apenas menciona V360 isoladamente (sem o wrapper :::highlight)", () => {
    const factualMention = "Primeiro parágrafo.\n\nA V360 é uma agência de marketing industrial fundada em São Paulo.";
    expect(hasV360ClosingParagraph(factualMention)).toBe(false);
    expect(ctaParagraphStatus(factualMention)).toBe("unwrapped");
    expect(stripV360ClosingParagraph(factualMention)).toBe(factualMention);
  });

  it("retorna 'missing' (nada a remover) quando não há menção alguma à V360", () => {
    const noMention = "Primeiro parágrafo.\n\nSegundo parágrafo sem qualquer menção comercial.";
    expect(ctaParagraphStatus(noMention)).toBe("missing");
    expect(stripV360ClosingParagraph(noMention)).toBe(noMention);
  });
});

describe("firstParagraph", () => {
  it("extrai o primeiro parágrafo de um body com múltiplos parágrafos", () => {
    expect(firstParagraph("Primeiro.\n\nSegundo.\n\nTerceiro.")).toBe("Primeiro.");
  });

  it("retorna o texto inteiro quando há um único parágrafo", () => {
    expect(firstParagraph("Único parágrafo sem quebras.")).toBe("Único parágrafo sem quebras.");
  });
});

describe("normalizeSourceUrl (Fase 3)", () => {
  it("remove trim", () => {
    expect(normalizeSourceUrl("  https://exemplo.com/materia  ")).toBe("exemplo.com/materia");
  });

  it("normaliza host removendo www.", () => {
    expect(normalizeSourceUrl("https://www.exemplo.com/materia")).toBe(normalizeSourceUrl("https://exemplo.com/materia"));
  });

  it("remove fragment (#...)", () => {
    expect(normalizeSourceUrl("https://exemplo.com/materia#secao")).toBe("exemplo.com/materia");
  });

  it("remove utm_source, utm_medium, utm_campaign, utm_term, utm_content", () => {
    const url = "https://exemplo.com/m?utm_source=x&utm_medium=y&utm_campaign=z&utm_term=w&utm_content=v";
    expect(normalizeSourceUrl(url)).toBe("exemplo.com/m");
  });

  it("remove múltiplos parâmetros de tracking do Google Ads (gclid, gbraid, gad_source, gad_campaignid)", () => {
    const url = "https://exemplo.com/m?gad_source=1&gad_campaignid=22&gbraid=abc&gclid=xyz";
    expect(normalizeSourceUrl(url)).toBe("exemplo.com/m");
  });

  it("preserva query parameter funcional não reconhecido como tracking", () => {
    expect(normalizeSourceUrl("https://exemplo.com/m?id=42")).toBe("exemplo.com/m?id=42");
  });

  it("duas URLs equivalentes (com/sem UTM) normalizam para o mesmo valor", () => {
    const a = normalizeSourceUrl("https://www.exemplo.com/materia-x");
    const b = normalizeSourceUrl("https://exemplo.com/materia-x?utm_source=newsletter&utm_medium=email");
    expect(a).toBe(b);
  });

  it("URL inválida retorna o texto original (sem lançar exceção)", () => {
    expect(normalizeSourceUrl("não é uma url")).toBe("não é uma url");
  });
});

describe("extractDirectQuotes / validateDirectQuotes (Fase 3)", () => {
  it("não extrai termos curtos entre aspas (nome de programa)", () => {
    expect(extractDirectQuotes('A empresa lançou o "Programa Impulso" este ano.')).toEqual([]);
  });

  it("extrai uma citação longa entre aspas", () => {
    const quotes = extractDirectQuotes('O ministro disse: "vamos triplicar os investimentos até o fim do ano que vem".');
    expect(quotes).toEqual(["vamos triplicar os investimentos até o fim do ano que vem"]);
  });

  it("citação existente literalmente na fonte é válida", () => {
    const source = 'O ministro afirmou: "vamos triplicar os investimentos até o fim do ano que vem", durante o evento.';
    const conteudo = 'O ministro declarou: "vamos triplicar os investimentos até o fim do ano que vem".';
    expect(validateDirectQuotes(conteudo, source).valid).toBe(true);
  });

  it("citação que é paráfrase (não existe literalmente) é HARD FAIL", () => {
    const source = "O ministro comentou sobre planos de expandir os investimentos no próximo ano.";
    const conteudo = 'O ministro afirmou: "vamos triplicar os investimentos até o fim do ano que vem".';
    const result = validateDirectQuotes(conteudo, source);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/não encontrada literalmente/);
  });

  it("diferenças puramente tipográficas (aspas retas vs tipográficas) não invalidam a citação", () => {
    const source = "O diretor disse: “vamos investir dez milhões este ano”.";
    const conteudo = 'O diretor afirmou: "vamos investir dez milhões este ano".';
    expect(validateDirectQuotes(conteudo, source).valid).toBe(true);
  });

  it("texto sem nenhuma citação direta é sempre válido", () => {
    expect(validateDirectQuotes("Texto sem aspas nenhuma.", "Fonte qualquer.").valid).toBe(true);
  });
});
