import axios from "axios";
import { z } from "zod";
import { llm } from "../llm";
import { invokeWithUsageTelemetry } from "../costs/record-llm-usage";
import { recordProviderUsage } from "../costs/usage-repository";
import { checkAndReserveBudget, reconcileBudget, releaseBudget } from "../budget/circuit-breaker";
import type { AgentState, AgentStateUpdate } from "../state";

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
//
// Fase 7 (Secao 9) — instrumenta a chamada real ao GNews: status, latency,
// quantidade de resultados, quota/rate-limit headers quando presentes,
// erro/timeout. GNews nao documenta custo monetario por requisicao para
// esta conta (plano nao expoe billing via API) — cost_status="unavailable"
// sempre, nunca inventado (Secao 9/49).
async function searchGNews(runId: string | undefined): Promise<GNewsArticle[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  const startedAt = new Date().toISOString();

  // Fase 9B.0 — GNews nao tem custo monetario confirmado (plano
  // free-tier/quota, "unavailable" sempre — ver pricing.ts), entao
  // estimatedCost=0 aqui. A reserva ainda serve para futura contagem de
  // REQUEST_QUOTA quando a cota numerica real for confirmada (Fase 9A:
  // hoje indisponivel, nao estimavel). Bloqueio em ENFORCE degrada
  // graciosamente como "zero artigos" — o mesmo comportamento ja usado
  // para falha de rede/timeout, nunca lanca excecao aqui.
  const reservation = await checkAndReserveBudget({ provider: "gnews", operation: "news_search", estimatedCost: 0, runId });
  if (!reservation.allowed) {
    await recordProviderUsage({
      runId,
      provider: "gnews",
      operation: "news_search",
      startedAt,
      finishedAt: new Date().toISOString(),
      costStatus: "unavailable",
      success: false,
      errorCode: "BudgetExceededError",
      errorMessage: `Bloqueado pelo circuit breaker de orçamento: ${reservation.reason}`,
    }).catch(() => undefined);
    return [];
  }

  try {
    const response = await axios.get<GNewsSearchResponse>("https://gnews.io/api/v4/search", {
      params: {
        q: '("indústria" OR "manufatura" OR "fábrica" OR "indústria 4.0" OR "gestão industrial")',
        lang: "pt",
        country: "br",
        max: 10,
        apikey: apiKey,
      },
      timeout: 10_000,
    });
    const finishedAt = new Date().toISOString();
    const quotaHeaders: Record<string, unknown> = {};
    const headers = response.headers ?? {};
    for (const key of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
      if (headers[key] !== undefined) quotaHeaders[key] = headers[key];
    }
    await recordProviderUsage({
      runId,
      provider: "gnews",
      operation: "news_search",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      usage: {
        status: response.status,
        result_count: response.data.articles?.length ?? 0,
        total_articles: response.data.totalArticles,
        ...(Object.keys(quotaHeaders).length ? { quota_headers: quotaHeaders } : {}),
      },
      costStatus: "unavailable",
      success: true,
    }).catch(() => undefined);
    await reconcileBudget(reservation.reservationId, 0);
    return response.data.articles ?? [];
  } catch (error) {
    await releaseBudget(reservation.reservationId);
    const finishedAt = new Date().toISOString();
    const timedOut = axios.isAxiosError(error) && error.code === "ECONNABORTED";
    await recordProviderUsage({
      runId,
      provider: "gnews",
      operation: "news_search",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      costStatus: "unavailable",
      success: false,
      errorCode: timedOut ? "Timeout" : axios.isAxiosError(error) ? `HTTP_${error.response?.status ?? "network"}` : "UnknownError",
      errorMessage: axios.isAxiosError(error) ? error.message.slice(0, 500) : "Erro nao normalizavel na busca GNews.",
    }).catch(() => undefined);
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
export async function newsFetcherNode(state: AgentState): Promise<AgentStateUpdate> {
  const articles = await searchGNews(state.runId);

  if (articles.length === 0) {
    return {
      candidatesFound: 0,
      currentStep: "Nenhuma notícia relevante encontrada na GNews — encerrando execução.",
    };
  }

  const picker = llm.withStructuredOutput(PickSchema, { includeRaw: true });
  const { index } = await invokeWithUsageTelemetry({ runId: state.runId, operation: "news_pick", modelRequested: "gpt-4o" }, () =>
    picker.invoke([
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
    ]),
  );

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
    candidatesFound: articles.length,
    currentStep: `Pauta selecionada: "${chosen.title}"`,
  };
}
