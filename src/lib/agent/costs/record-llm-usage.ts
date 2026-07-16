import { calculateOpenAiCost } from "./calculate-cost";
import { recordProviderUsage, type UsageOperation } from "./usage-repository";

// Fase 7 (Secao 7/8) — helper unico reaproveitado pelos 5 nos que chamam a
// OpenAI (Drafter, InternalAuditor, SemanticDedupeGate, NewsworthinessGate,
// NewsFetcher). Antes, so drafter.ts tinha essa telemetria, duplicada
// inline (Fase 6, prova de conceito). Centralizar aqui evita 5 copias
// divergentes do mesmo calculo de custo/extracao de usage_metadata.

export interface RawOpenAiMessage {
  id?: string;
  usage_metadata?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_token_details?: { cache_read?: number };
  };
  response_metadata?: {
    model_name?: string;
    finish_reason?: string;
  };
}

export function extractUsageMetadata(raw: unknown): RawOpenAiMessage["usage_metadata"] | undefined {
  return (raw as RawOpenAiMessage | undefined)?.usage_metadata;
}

/**
 * Mensagem de erro SANITIZADA (Secao 7/28) — nunca stack trace completo,
 * nunca corpo de resposta bruto (poderia conter fragmento de prompt/fonte),
 * nunca headers/API key. Apenas `error.message` de um Error real, ou uma
 * string fixa para qualquer outro tipo lancado.
 */
export function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return { code: error.name || "Error", message: error.message.slice(0, 500) };
  }
  return { code: "UnknownError", message: "Erro nao normalizavel lancado pelo provider ou client." };
}

export interface LlmUsageContext {
  runId?: string;
  operation: UsageOperation;
  modelRequested: string;
  attemptNumber?: number;
  publishedPostId?: string;
}

/**
 * Executa `call` (uma invocacao real a OpenAI via
 * `llm.withStructuredOutput(Schema, {includeRaw:true})`), registra UMA
 * linha de telemetria em agent_provider_usage (sucesso OU falha — Secao 8:
 * toda chamada real gera sua propria linha, nunca sobrescreve a anterior) e
 * devolve apenas o `parsed` para o chamador. Best-effort: falha ao
 * registrar telemetria nunca derruba o node (mesma politica da Fase 6).
 */
export async function invokeWithUsageTelemetry<T>(
  ctx: LlmUsageContext,
  call: () => Promise<{ raw: unknown; parsed: T }>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const { raw, parsed } = await call();
    const finishedAt = new Date().toISOString();
    const usage = extractUsageMetadata(raw);
    const rawMessage = raw as RawOpenAiMessage;

    if (usage) {
      const cachedInputTokens = usage.input_token_details?.cache_read ?? 0;
      const cost = calculateOpenAiCost({
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedInputTokens,
        model: ctx.modelRequested,
      });
      await recordProviderUsage({
        runId: ctx.runId,
        provider: "openai",
        operation: ctx.operation,
        model: ctx.modelRequested,
        modelReturned: rawMessage.response_metadata?.model_name,
        requestId: rawMessage.id,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cached_input_tokens: cachedInputTokens,
          total_tokens: usage.total_tokens,
        },
        currency: "USD",
        estimatedCost: cost.costUsd,
        costStatus: cost.status,
        finishReason: rawMessage.response_metadata?.finish_reason,
        attemptNumber: ctx.attemptNumber,
        success: true,
        publishedPostId: ctx.publishedPostId,
      }).catch(() => undefined);
    }

    return parsed;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const normalized = normalizeError(error);
    await recordProviderUsage({
      runId: ctx.runId,
      provider: "openai",
      operation: ctx.operation,
      model: ctx.modelRequested,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      costStatus: "unavailable",
      attemptNumber: ctx.attemptNumber,
      success: false,
      errorCode: normalized.code,
      errorMessage: normalized.message,
    }).catch(() => undefined);
    throw error;
  }
}
