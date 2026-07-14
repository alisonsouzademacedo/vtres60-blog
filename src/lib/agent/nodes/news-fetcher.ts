import axios from "axios";
import { z } from "zod";
import { llm } from "../llm";
import type { AgentStateUpdate } from "../state";

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
}

interface GNewsSearchResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

const PickSchema = z.object({
  index: z.number().int().describe("Indice (comecando em 0) da noticia escolhida na lista fornecida"),
  reason: z.string().describe("Justificativa breve da escolha, em uma frase"),
});

// GNews.io devolve a URL direta do artigo (diferente do RSS do Google News,
// que devolvia um link de redirecionamento resolvido via JS no navegador —
// isso quebrava o ContentExtractor, que so faz fetch HTTP simples).
async function searchGNews(): Promise<GNewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  try {
    const { data } = await axios.get<GNewsSearchResponse>("https://gnews.io/api/v4/search", {
      params: {
        q: '("indústria" OR "manufatura" OR "fábrica" OR "indústria 4.0" OR "gestão industrial")',
        lang: "pt",
        country: "br",
        max: 10,
        apikey: apiKey,
      },
      timeout: 10_000,
    });
    return data.articles ?? [];
  } catch {
    return [];
  }
}

/**
 * Busca noticias recentes via GNews.io e usa o LLM para escolher a de
 * maior aderencia ao nicho de manufatura/industria B2B, considerando
 * titulo e descricao. Salva a URL escolhida em `sourceUrl` para o
 * ContentExtractor.
 *
 * Se a API falhar (rede, chave invalida, rate limit) ou nao retornar
 * nenhum artigo, NAO lanca excecao — devolve o state sem `sourceUrl`,
 * o que faz routeAfterNewsFetch (workflow.ts) encerrar o grafo em END de
 * forma graciosa, sem derrubar a aplicacao.
 */
export async function newsFetcherNode(): Promise<AgentStateUpdate> {
  const articles = await searchGNews();

  if (articles.length === 0) {
    return {
      currentStep: "Nenhuma notícia relevante encontrada na GNews — encerrando execução.",
    };
  }

  const picker = llm.withStructuredOutput(PickSchema);
  const { index } = await picker.invoke([
    {
      role: "system",
      content:
        "Voce escolhe, entre noticias, a que tem maior aderencia ao nicho de manufatura e " +
        "industria B2B brasileira. Responda apenas com o indice escolhido.",
    },
    {
      role: "user",
      content: articles
        .map((article, i) => `${i}. ${article.title}${article.description ? ` — ${article.description}` : ""}`)
        .join("\n"),
    },
  ]);

  const chosenIndex = articles[index] ? index : 0;
  const chosen = articles[chosenIndex];

  // Fase 6 — as demais candidatas ficam como fallback: se um gate
  // posterior rejeitar `chosen`, o NextCandidate consome esta fila em vez
  // de encerrar a execucao inteira sem publicacao. Ver nodes/next-candidate.ts.
  const candidateQueue = articles
    .filter((_, i) => i !== chosenIndex)
    .map((article) => ({ url: article.url, title: article.title }));

  return {
    sourceUrl: chosen.url,
    candidateTitle: chosen.title,
    candidateQueue,
    currentStep: `Pauta selecionada: "${chosen.title}"`,
  };
}
