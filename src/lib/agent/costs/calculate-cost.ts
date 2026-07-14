import { findModelPrice } from "./pricing";

export type CostStatus = "confirmed" | "estimated" | "unavailable";

export interface CostResult {
  status: CostStatus;
  costUsd: number | undefined;
  priceVerified: boolean;
}

/**
 * Custo de uma chamada OpenAI a partir do usage_metadata REAL retornado
 * pela API (ver AIMessage.usage_metadata — input_tokens/output_tokens/
 * input_token_details.cache_read). status="confirmed" significa "os
 * TOKENS sao reais/confirmados pelo provider" — NAO que o PRECO em si foi
 * reverificado ao vivo (isso e o que `priceVerified` comunica
 * separadamente; ver pricing.ts). Nunca confundir os dois eixos.
 */
export function calculateOpenAiCost(input: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  model?: string;
}): CostResult {
  const model = input.model ?? "gpt-4o";
  const inputPrice = findModelPrice("openai", model, "per_1k_input_tokens");
  const outputPrice = findModelPrice("openai", model, "per_1k_output_tokens");
  const cachedPrice = findModelPrice("openai", model, "per_1k_cached_input_tokens");

  if (!inputPrice || !outputPrice) {
    return { status: "unavailable", costUsd: undefined, priceVerified: false };
  }

  const nonCachedInputTokens = Math.max(0, input.inputTokens - input.cachedInputTokens);
  const inputCost = (nonCachedInputTokens / 1000) * inputPrice.price;
  const cachedCost = cachedPrice ? (input.cachedInputTokens / 1000) * cachedPrice.price : 0;
  const outputCost = (input.outputTokens / 1000) * outputPrice.price;

  return {
    status: "confirmed",
    costUsd: inputCost + cachedCost + outputCost,
    priceVerified: inputPrice.verified && outputPrice.verified,
  };
}

/**
 * Custo de uma geracao de imagem via Replicate. status="estimated" sempre
 * (nunca "confirmed"): Replicate nao devolve o custo exato da predicao na
 * resposta da API consumida por este pipeline, entao o valor vem do preco
 * canonico (pricing.ts), nao de um numero confirmado pelo provider.
 *
 * Simplificacao deliberada: custo=0 em falha. Replicate PODE cobrar por
 * tempo de compute mesmo em predicoes que falham (nao confirmado nesta
 * sessao — WebSearch/WebFetch bloqueados); tratar falha como custo zero
 * evita inventar um numero sem base, as custa de possivelmente subestimar
 * o gasto real em falhas. Documentar isso claramente no painel.
 */
export function calculateReplicateImageCost(input: { succeeded: boolean }): CostResult {
  const price = findModelPrice("replicate", "black-forest-labs/flux-schnell", "per_image");
  if (!price) return { status: "unavailable", costUsd: undefined, priceVerified: false };
  if (!input.succeeded) return { status: "estimated", costUsd: 0, priceVerified: price.verified };
  return { status: "estimated", costUsd: price.price, priceVerified: price.verified };
}
