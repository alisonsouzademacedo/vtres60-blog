import axios from "axios";
import { calculateReplicateImageCost } from "../costs/calculate-cost";
import { findModelPrice } from "../costs/pricing";
import { recordProviderUsage } from "../costs/usage-repository";
import { checkAndReserveBudget, reconcileBudget, releaseBudget } from "../budget/circuit-breaker";

export interface PexelsCandidate {
  url: string; // src.original — maior resolucao disponivel para download/QA
  photographer: string | undefined;
  photographerUrl: string | undefined;
  pageUrl: string | undefined;
}

const PEXELS_CANDIDATE_COUNT = 3;

// Fase 7 (Secao 11) — instrumenta a busca real ao Pexels: quantidade de
// buscas (uma linha por chamada desta funcao), latency, status, quota
// headers quando presentes, candidatas retornadas, falhas. "Candidata
// rejeitada/selecionada" e decisao POSTERIOR (download+QA em
// image-processor.ts, ja logada via operationsRepository/logTier) — nao
// duplicada aqui. Pexels e gratuito no plano atual desta conta —
// cost_status="unavailable" sempre, nunca um custo monetario inventado
// (Secao 11/49).
export async function fetchPexelsCandidates(keyword: string, runId?: string): Promise<PexelsCandidate[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !keyword) return [];
  const startedAt = new Date().toISOString();

  // Fase 9B.0 — Pexels sem custo monetario confirmado (free tier,
  // "unavailable" — mesma razao do GNews). Bloqueio degrada graciosamente
  // pra lista vazia, ImageProcessor ja cai pro tier seguinte (placeholder).
  const reservation = await checkAndReserveBudget({ provider: "pexels", operation: "pexels_search", estimatedCost: 0, runId });
  if (!reservation.allowed) {
    await recordProviderUsage({
      runId,
      provider: "pexels",
      operation: "pexels_search",
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
    const response = await axios.get("https://api.pexels.com/v1/search", {
      params: { query: keyword, per_page: PEXELS_CANDIDATE_COUNT, orientation: "landscape" },
      headers: { Authorization: apiKey },
      timeout: 10_000,
    });
    const finishedAt = new Date().toISOString();
    const photos = Array.isArray(response.data?.photos) ? response.data.photos : [];
    const quotaHeaders: Record<string, unknown> = {};
    const headers = response.headers ?? {};
    for (const key of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
      if (headers[key] !== undefined) quotaHeaders[key] = headers[key];
    }
    await recordProviderUsage({
      runId,
      provider: "pexels",
      operation: "pexels_search",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      usage: { status: response.status, candidates_returned: photos.length, ...(Object.keys(quotaHeaders).length ? { quota_headers: quotaHeaders } : {}) },
      costStatus: "unavailable",
      success: true,
    }).catch(() => undefined);
    await reconcileBudget(reservation.reservationId, 0);
    return photos
      .map((photo: Record<string, unknown>) => {
        const src = photo.src as Record<string, unknown> | undefined;
        const url = src?.original as string | undefined;
        if (!url) return undefined;
        return {
          url,
          photographer: (photo.photographer as string | undefined) ?? undefined,
          photographerUrl: (photo.photographer_url as string | undefined) ?? undefined,
          pageUrl: (photo.url as string | undefined) ?? undefined,
        };
      })
      .filter((candidate: PexelsCandidate | undefined): candidate is PexelsCandidate => Boolean(candidate));
  } catch (error) {
    await releaseBudget(reservation.reservationId);
    const finishedAt = new Date().toISOString();
    await recordProviderUsage({
      runId,
      provider: "pexels",
      operation: "pexels_search",
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      costStatus: "unavailable",
      success: false,
      errorCode: axios.isAxiosError(error) ? `HTTP_${error.response?.status ?? "network"}` : "UnknownError",
      errorMessage: axios.isAxiosError(error) ? error.message.slice(0, 500) : "Erro nao normalizavel na busca Pexels.",
    }).catch(() => undefined);
    return [];
  }
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | string | null;
  error?: string | null;
  metrics?: { predict_time?: number };
}

function extractReplicateUrl(output: ReplicatePrediction["output"]): string | undefined {
  if (!output) return undefined;
  return Array.isArray(output) ? output[0] : output;
}

const REPLICATE_MODEL = "black-forest-labs/flux-schnell";

// Replicate/Flux-schnell — provider e modelo preservados da Fase 3 (so o
// prompt mudou, ver replicate-prompt.ts). Endpoint de "modelo oficial"
// (nao fixa version hash). Qualquer falha (402 sem credito, rede, timeout)
// e capturada graciosamente — devolve undefined, quem chama cai pro tier
// seguinte.
//
// Fase 7 (Secao 10) — instrumenta prediction id, status, timestamps,
// latency, metrics.predict_time (compute duration real, quando o
// provider devolve — nem toda resposta traz esse campo), erro/codigo de
// billing (402 sem credito, confirmado na Fase 6 para esta conta) e
// sucesso/falha. Custo via calculateReplicateImageCost() — sempre
// status="estimated" (Replicate nao devolve custo exato na resposta desta
// API, ver comentario em calculate-cost.ts); falha = custo 0, documentado
// como simplificacao deliberada la mesmo.
export async function generateWithReplicate(prompt: string, runId?: string): Promise<string | undefined> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return undefined;

  const startedAt = new Date().toISOString();
  let predictionId: string | undefined;

  // Fase 9B.0 — Replicate tem preco confirmado ($0,003/imagem,
  // verificado ao vivo em 15/07/2026, ver pricing.ts). Estimativa
  // pre-chamada usa esse preco cheio (o custo real so cai pra 0 se a
  // predicao falhar, reconciliado depois via calculateReplicateImageCost
  // ja existente). Bloqueio degrada graciosamente pra undefined —
  // ImageProcessor ja cai pro tier Pexels nesse caso.
  const replicatePrice = findModelPrice("replicate", "black-forest-labs/flux-schnell", "per_image")?.price ?? 0;
  const reservation = await checkAndReserveBudget({ provider: "replicate", operation: "image_generation", estimatedCost: replicatePrice, runId });
  if (!reservation.allowed) {
    await recordProviderUsage({
      runId,
      provider: "replicate",
      operation: "image_generation",
      model: REPLICATE_MODEL,
      startedAt,
      finishedAt: new Date().toISOString(),
      costStatus: "unavailable",
      success: false,
      errorCode: "BudgetExceededError",
      errorMessage: `Bloqueado pelo circuit breaker de orçamento: ${reservation.reason}`,
    }).catch(() => undefined);
    return undefined;
  }

  try {
    const { data: prediction } = await axios.post<ReplicatePrediction>(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      { input: { prompt } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=30",
        },
        timeout: 35_000,
      },
    );
    predictionId = prediction.id;

    let current = prediction;
    for (
      let attempt = 0;
      attempt < 10 && current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const { data } = await axios.get<ReplicatePrediction>(`https://api.replicate.com/v1/predictions/${current.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      current = data;
    }

    const finishedAt = new Date().toISOString();
    const succeeded = current.status === "succeeded";
    const cost = calculateReplicateImageCost({ succeeded });
    await recordProviderUsage({
      runId,
      provider: "replicate",
      operation: "image_generation",
      model: REPLICATE_MODEL,
      requestId: current.id,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      usage: { status: current.status, ...(current.metrics?.predict_time !== undefined ? { predict_time_s: current.metrics.predict_time } : {}) },
      currency: "USD",
      estimatedCost: cost.costUsd,
      costStatus: cost.status,
      success: succeeded,
      errorCode: succeeded ? undefined : "PredictionNotSucceeded",
      errorMessage: succeeded ? undefined : (current.error ?? `status=${current.status}`)?.slice(0, 500),
    }).catch(() => undefined);
    await reconcileBudget(reservation.reservationId, cost.costUsd ?? 0);

    return succeeded ? extractReplicateUrl(current.output) : undefined;
  } catch (error) {
    await releaseBudget(reservation.reservationId);
    const finishedAt = new Date().toISOString();
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    // 402 = sem credito (Fase 6 confirmou esse estado para esta conta) —
    // codigo distinto para o painel diferenciar "sem saldo" de outras
    // falhas (rede/timeout/5xx) sem precisar parsear a mensagem.
    const errorCode = status === 402 ? "InsufficientCredit" : axios.isAxiosError(error) ? `HTTP_${status ?? "network"}` : "UnknownError";
    await recordProviderUsage({
      runId,
      provider: "replicate",
      operation: "image_generation",
      model: REPLICATE_MODEL,
      requestId: predictionId,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      costStatus: "unavailable",
      success: false,
      errorCode,
      errorMessage: axios.isAxiosError(error) ? error.message.slice(0, 500) : "Erro nao normalizavel na geracao Replicate.",
    }).catch(() => undefined);
    return undefined;
  }
}
