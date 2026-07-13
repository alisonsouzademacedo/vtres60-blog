import { Readability } from "@mozilla/readability";
import axios from "axios";
import { JSDOM } from "jsdom";
import type { AgentState, AgentStateUpdate } from "../state";

// Resolve URL relativa (raro, mas alguns sites fazem isso em og:image)
// contra a URL da materia. Retorna undefined se o valor nao for uma URL
// utilizavel de jeito nenhum.
function resolveOgImage(rawValue: string | null | undefined, baseUrl: string): string | undefined {
  if (!rawValue) return undefined;
  try {
    return new URL(rawValue, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Baixa a pagina de `sourceUrl` e extrai:
 * 1. og:image do <head> — candidato a imagem principal (ver
 *    image-processor.ts), extraido ANTES do Readability.parse() porque
 *    esse metodo mutila o documento em memoria como parte do seu
 *    algoritmo, e o og:image pode ficar inacessivel depois.
 * 2. O corpo do artigo via @mozilla/readability (o mesmo algoritmo do
 *    Modo de Leitura do Firefox), em vez de uma heuristica propria de
 *    tags <article>/<p> — testado contra otempo.com.br: a tag <article>
 *    ali e usada para o widget "Mais Lidas" da lateral, nao para o corpo
 *    da materia, e uma heuristica ingenua extraia 0 caracteres
 *    silenciosamente. Readability + jsdom resolveu em 3/3 sites testados.
 */
export async function contentExtractorNode(state: AgentState): Promise<AgentStateUpdate> {
  if (!state.sourceUrl) {
    throw new Error("ContentExtractor: sourceUrl ausente no state.");
  }

  const { data: html } = await axios.get<string>(state.sourceUrl, {
    responseType: "text",
    timeout: 15_000,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VTRES60Agent/1.0)" },
  });

  const dom = new JSDOM(html, { url: state.sourceUrl });
  const ogImage = resolveOgImage(
    dom.window.document.querySelector('meta[property="og:image"]')?.getAttribute("content"),
    state.sourceUrl,
  );
  // Fase 4 — unico sinal textual real disponivel para QA de relevancia da
  // source_og (ver image-pipeline/relevance.ts). Extraido ANTES do
  // Readability.parse() pelo mesmo motivo do ogImage acima (parse() muta o
  // DOM). Ausente na maioria dos sites — tratado como undefined, nunca
  // inventado.
  const ogImageAlt = dom.window.document.querySelector('meta[property="og:image:alt"]')?.getAttribute("content")?.trim() || undefined;

  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.trim() ?? "";

  if (!text) {
    throw new Error(`ContentExtractor: nao foi possivel extrair texto de ${state.sourceUrl}.`);
  }

  return {
    sourceText: text,
    ogImage,
    ogImageAlt,
    currentStep: "Conteudo original extraido, redigindo...",
  };
}
