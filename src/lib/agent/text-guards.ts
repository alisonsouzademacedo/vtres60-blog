// Cliches de fechamento de redacao escolar/ENEM que o LLM insiste em usar
// mesmo com a proibicao explicita no prompt do Drafter (visto em
// producao: "por fim" sobreviveu a 5 tentativas seguidas de reescrita na
// mesma fonte). Compartilhado entre o Auditor (deteccao — forca nova
// tentativa) e o Publisher (rede de seguranca final — remove
// deterministicamente antes de publicar, caso a IA nunca convirja
// sozinha dentro do teto de tentativas).
export const BANNED_CLOSING_PHRASES = ["por fim", "em suma", "diante do exposto"];

export function findBannedClosingPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_CLOSING_PHRASES.filter((phrase) => lower.includes(phrase));
}

// Remove deterministicamente qualquer cliche que tenha sobrevivido ate o
// fallback de emergencia (esgotadas as tentativas do Drafter). Assume o
// padrao real observado: a frase abre um paragrafo, seguida de virgula
// ("Por fim, a humanizacao das marcas..."). Recapitaliza a letra seguinte
// para a frase continuar gramatical apos a remocao.
export function stripBannedClosingPhrases(text: string): string {
  let result = text;
  for (const phrase of BANNED_CLOSING_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\s*,?\\s*`, "gi");
    result = result.replace(pattern, "");
  }
  return result.replace(/(^|\n\n)([a-zà-ÿ])/g, (_all, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

// ATE A FASE 1, o DRAFTER_SYSTEM_PROMPT exigia um paragrafo final com
// mencao a V360 envolto em ":::highlight", e o Publisher forcava esse
// paragrafo via ensureV360ClosingParagraph() quando o Drafter o omitia.
// Na FASE 2 essa exigencia foi removida (o CTA comercial agora vive em
// post.cta / componente "Proxima decisao", separado do body) — mas os
// posts publicados ANTES da Fase 2 ainda podem conter esse paragrafo no
// body. As duas funcoes abaixo continuam existindo exclusivamente como
// DETECTOR (nao gerador) desse padrao legado, usadas pelo script de
// backfill (scripts/backfill-excerpt-impact.ts) para identificar e
// remover, com seguranca, o paragrafo antigo quando ele for encontrado.
export function hasV360ClosingParagraph(text: string): boolean {
  return /:::highlight[\s\S]*v360[\s\S]*:::highlight/i.test(text);
}

export type CtaParagraphStatus = "ok" | "unwrapped" | "missing";

export function ctaParagraphStatus(text: string): CtaParagraphStatus {
  if (hasV360ClosingParagraph(text)) return "ok";
  return /v360/i.test(text) ? "unwrapped" : "missing";
}

// Remove o paragrafo de fechamento legado da V360 (formato
// ":::highlight ... v360 ... :::highlight") quando presente — usado pelo
// backfill da Fase 2 para limpar posts publicados antes da mudanca de
// prompt. So remove o bloco :::highlight que efetivamente menciona V360
// (deteccao positiva via hasV360ClosingParagraph); nao mexe em nenhum
// outro trecho do texto. Texto sem o bloco e devolvido inalterado.
export function stripV360ClosingParagraph(text: string): string {
  if (!hasV360ClosingParagraph(text)) return text;
  return text.replace(/\n*:::highlight[\s\S]*?v360[\s\S]*?:::highlight\n*/i, "\n\n").trim();
}

// ---- validacao editorial deterministica de excerpt/impact (Fase 2) ----
// Objetivo estreito: barrar os padroes deterministicos que o sistema
// anterior produzia (corte de caractere terminando em reticencias,
// impact sendo so uma paraphrase do excerpt) — nao um detector
// linguistico universal de qualidade de texto.

const MIN_COMPARISON_TOKEN_LENGTH = 3; // descarta artigos/preposicoes curtas ("o", "a", "de", "em"...) que inflam a sobreposicao sem indicar conteudo repetido.

function normalizeForComparison(text: string): string {
  return text.toLowerCase().trim();
}

function tokenize(text: string): Set<string> {
  const matches = normalizeForComparison(text).match(/\p{L}+/gu) ?? [];
  return new Set(matches.filter((token) => token.length > MIN_COMPARISON_TOKEN_LENGTH));
}

// Coeficiente de Jaccard sobre tokens (|intersecao| / |uniao|) — simples,
// explicavel e testavel, sem chamada extra a LLM nem embeddings so para
// comparar dois textos curtos.
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) if (tokensB.has(token)) intersection += 1;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Acima deste limiar, excerpt e impact repetem essencialmente o mesmo
// conteudo (mesmo com troca de palavras) em vez de cumprirem papeis
// diferentes (resumo vs analise). 0.6 foi escolhido para deixar espaco ao
// vocabulario factual naturalmente compartilhado (nome da empresa, setor,
// numero central do fato) sem permitir que um texto seja so uma
// paraphrase do outro.
export const EXCERPT_IMPACT_OVERLAP_THRESHOLD = 0.6;

export function firstParagraph(body: string): string {
  return body.split(/\n\n+/)[0]?.trim() ?? "";
}

// Fase 2: metadata de SEO, NAO o excerpt exibido no site (esse vem direto
// de draft.excerpt, ja validado pelo InternalAuditor/backfill). Buscadores
// truncam meta description por volta de 155-160 caracteres — este e so um
// teto de seguranca para esse campo de SEO, nunca insere reticencias e
// nunca corta no meio de palavra/sigla: corta primeiro no limite de frase
// (. ! ou ?) mais proximo dentro do teto; se nao houver frase completa,
// cai para o ultimo limite de palavra antes do teto.
const META_DESCRIPTION_MAX_LENGTH = 160;

export function metaDescriptionFrom(excerpt: string): string {
  const clean = excerpt.replace(/\s+/g, " ").trim();
  if (clean.length <= META_DESCRIPTION_MAX_LENGTH) return clean;

  const truncated = clean.slice(0, META_DESCRIPTION_MAX_LENGTH);
  const sentenceEnd = Math.max(truncated.lastIndexOf(". "), truncated.lastIndexOf("! "), truncated.lastIndexOf("? "));
  if (sentenceEnd > 0) return truncated.slice(0, sentenceEnd + 1).trim();

  const wordBoundary = truncated.lastIndexOf(" ");
  return (wordBoundary > 0 ? truncated.slice(0, wordBoundary) : truncated).trim();
}

const ELLIPSIS_ENDING = /(\.\.\.|…)\s*$/;
const SENTENCE_ENDING = /[.!?]["'”’)]?\s*$/;

export interface EditorialFieldValidation {
  valid: boolean;
  issues: string[];
}

// Nao tenta detectar "cortado no meio de palavra/sigla" de forma generica
// (impossivel de forma confiavel) — em vez disso, exige terminar em
// pontuacao de frase e proibe reticencias. Um texto genuinamente completo
// (nao produzido por corte de caractere) sempre termina em pontuacao; um
// texto cortado por slice() nao termina, ou termina em "..."/"…" — os dois
// unicos padroes deterministicos que o sistema anterior de fato produzia.
export function validateExcerpt(excerpt: string, title: string): EditorialFieldValidation {
  const issues: string[] = [];
  const trimmed = excerpt.trim();
  if (!trimmed) {
    return { valid: false, issues: ["excerpt vazio"] };
  }
  if (ELLIPSIS_ENDING.test(trimmed)) issues.push('excerpt termina com reticências ("..." ou "…")');
  if (!SENTENCE_ENDING.test(trimmed)) issues.push("excerpt não termina com pontuação de frase completa (. ! ou ?)");
  if (normalizeForComparison(trimmed) === normalizeForComparison(title)) issues.push("excerpt é idêntico ao título");
  return { valid: issues.length === 0, issues };
}

// ---- normalizacao de source URL para deduplicacao exata (Fase 3) ----
// Conservadora de proposito: so remove o que e identificavel, sem ambiguidade,
// como parametro de tracking. Nao faz canonicalizacao agressiva — um query
// param funcional desconhecido (ex: usado por um site para distinguir
// materias) e preservado.
const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid", // Google Click ID
  "gbraid", // Google Ads click id (iOS/privacy-preserving)
  "wbraid", // Google Ads click id (privacy-preserving, web)
  "gad_source", // Google Ads source
  "gad_campaignid", // Google Ads campaign id
  "fbclid", // Facebook Click ID
]);

export function normalizeSourceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_QUERY_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  const search = url.searchParams.toString();
  return `${host}${pathname}${search ? `?${search}` : ""}`;
}

// ---- validacao deterministica de citacoes diretas (Fase 3) ----
// Inspecao previa (relatorio da Fase 3, secao 20) confirmou: conteudo PODE
// conter citacao direta entre aspas (a propria REGRA DE DESTAQUE do prompt
// incentiva blockquote de frases centrais); sourceText permanece no state
// ate o InternalAuditor; a FRENTE 1 do AUDITOR_SYSTEM_PROMPT ja compara
// reescrito x original, mas via julgamento semantico do LLM, no ha
// verificacao deterministica de que uma citacao entre aspas existe
// LITERALMENTE na fonte. Por isso, implementada aqui.
//
// Conservador de proposito: exige um minimo de palavras para tratar como
// "declaracao direta" (evita marcar nome de programa/apelido/termo curto
// entre aspas como se fosse uma citacao factual verificavel).
const MIN_DIRECT_QUOTE_WORDS = 5;
const QUOTE_PATTERN = /["“]([^"”]{1,600})["”]/g;

export function extractDirectQuotes(text: string): string[] {
  const quotes: string[] = [];
  const pattern = new RegExp(QUOTE_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const content = match[1].trim();
    if (content.split(/\s+/).filter(Boolean).length >= MIN_DIRECT_QUOTE_WORDS) {
      quotes.push(content);
    }
  }
  return quotes;
}

function normalizeForQuoteMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[""'']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function validateDirectQuotes(conteudo: string, sourceText: string): EditorialFieldValidation {
  const quotes = extractDirectQuotes(conteudo);
  if (quotes.length === 0) return { valid: true, issues: [] };

  const normalizedSource = normalizeForQuoteMatch(sourceText);
  const issues: string[] = [];
  for (const quote of quotes) {
    const normalizedQuote = normalizeForQuoteMatch(quote);
    if (!normalizedSource.includes(normalizedQuote)) {
      issues.push(`citação direta não encontrada literalmente na fonte: "${quote}"`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateImpact(impact: string, excerpt: string, body: string): EditorialFieldValidation {
  const issues: string[] = [];
  const trimmed = impact.trim();
  if (!trimmed) {
    return { valid: false, issues: ["impact vazio"] };
  }
  const normalizedImpact = normalizeForComparison(trimmed);
  if (normalizedImpact === normalizeForComparison(excerpt)) issues.push("impact é idêntico ao excerpt");
  if (normalizedImpact === normalizeForComparison(firstParagraph(body))) {
    issues.push("impact é idêntico ao primeiro parágrafo do body");
  }
  const overlap = jaccardSimilarity(trimmed, excerpt);
  if (overlap > EXCERPT_IMPACT_OVERLAP_THRESHOLD) {
    issues.push(
      `impact tem sobreposição textual de ${Math.round(overlap * 100)}% com excerpt (limite: ${Math.round(EXCERPT_IMPACT_OVERLAP_THRESHOLD * 100)}%) — escreva uma análise, não uma paráfrase do resumo`,
    );
  }
  return { valid: issues.length === 0, issues };
}
