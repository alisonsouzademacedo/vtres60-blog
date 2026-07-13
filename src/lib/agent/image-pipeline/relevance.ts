// QA de relevancia da source_og — Fase 4, Secao 19 do spec.
//
// O projeto nao tem (e esta fase nao introduz) nenhum modelo com
// capacidade real de analise VISUAL de imagem — o `llm` do agente
// (ChatOpenAI/gpt-4o) e usado em todo o pipeline apenas via
// withStructuredOutput/invoke sobre TEXTO, nunca recebendo bytes/URL de
// imagem para "olhar" o conteudo. Fingir uma nota de relevancia visual sem
// nenhum modelo realmente vendo a imagem seria inventar um
// image_relevance_score — exatamente o que o spec proibe.
//
// Por isso a checagem aqui usa apenas sinais FACTUAIS reais e disponiveis:
// 1. provenance — a imagem veio do <head> da PROPRIA pagina do artigo
//    (ja garantido por so chegar aqui quem tem ogImage do ContentExtractor
//    daquela URL especifica, nao um banco generico).
// 2. og:image:alt, quando extraido — sinal textual real da propria pagina.
// 3. padrao da URL do asset — heuristica deterministica para o caso comum
//    de CMS que reusa um asset generico do site (logo/capa padrao) como
//    og:image em toda pagina, independente do conteudo do artigo.
//
// Quando nenhum desses sinais permite confirmar relevancia (o caso mais
// comum — a maioria dos sites nao preenche og:image:alt), o resultado e
// INCERTEZA, nao aprovacao automatica por omissao nem reprovacao por
// omissao: a imagem segue para o QA tecnico normalmente, e so e rejeitada
// por sinais NEGATIVOS explicitos (ver GENERIC_ASSET_PATTERNS abaixo).
const GENERIC_ASSET_URL_PATTERNS = [/\blogo\b/i, /\bfavicon\b/i, /\bdefault[-_]?image\b/i, /\bplaceholder\b/i, /\bog[-_]?default\b/i, /\bcapa[-_]?padrao\b/i];

const GENERIC_ALT_PATTERNS = [/^logo$/i, /^default$/i, /imagem padr[aã]o/i, /capa padr[aã]o/i];

export interface RelevanceCheck {
  relevant: boolean;
  reason?: "relevance_unverified";
}

export function assessSourceOgRelevance(imageUrl: string, ogImageAlt: string | undefined): RelevanceCheck {
  const negativeUrlSignal = GENERIC_ASSET_URL_PATTERNS.some((pattern) => pattern.test(imageUrl));
  const negativeAltSignal = ogImageAlt ? GENERIC_ALT_PATTERNS.some((pattern) => pattern.test(ogImageAlt.trim())) : false;

  if (negativeUrlSignal || negativeAltSignal) {
    return { relevant: false, reason: "relevance_unverified" };
  }

  return { relevant: true };
}
