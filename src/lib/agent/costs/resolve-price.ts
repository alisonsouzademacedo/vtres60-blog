import { findModelPrice, type ModelPrice } from "./pricing";
import type { ManualPriceEntry } from "./cost-settings-repository";
import type { UsageProvider } from "./usage-repository";

// Fase 7 (Secao 14) — os 4 estados de origem de preco NUNCA se misturam:
// um valor MANUAL jamais e apresentado como OFFICIAL_VERIFIED, e vice
// versa. Esta e a unica funcao que decide qual preco mostrar para um
// provider/model/unit, nesta ordem de prioridade:
//   1. OFFICIAL_VERIFIED — pricing.ts com verified:true (reverificado ao
//      vivo contra documentacao oficial, ver checkpoint da Secao 33).
//   2. MANUAL — cadastro administrativo ativo em provider_cost_settings,
//      para quando a verificacao automatica falhou/nao existe.
//   3. ESTIMATED — pricing.ts com verified:false (conhecimento de
//      treinamento do modelo, nao confirmado ao vivo) — melhor que nada,
//      mas nunca apresentado como confiavel para decisao financeira real.
//   4. UNAVAILABLE — nenhuma das anteriores.
export type PriceSource = "OFFICIAL_VERIFIED" | "MANUAL" | "ESTIMATED" | "UNAVAILABLE";

export interface ResolvedPrice {
  source: PriceSource;
  price: number | undefined;
  currency: string | undefined;
  sourceUrl: string | undefined;
  note: string | undefined;
}

const PRICEABLE_PROVIDERS = new Set<ModelPrice["provider"]>(["openai", "replicate", "gnews", "pexels"]);

function isPriceableProvider(provider: UsageProvider): provider is ModelPrice["provider"] {
  return PRICEABLE_PROVIDERS.has(provider as ModelPrice["provider"]);
}

/**
 * `provider` aceita qualquer UsageProvider (inclui "supabase") porque
 * precos MANUAIS podem ser cadastrados para qualquer provider — so
 * pricing.ts (OFFICIAL_VERIFIED/ESTIMATED) e restrito aos 4 providers "por
 * chamada" (Supabase Storage e custo de infraestrutura/plano, nunca teve
 * entrada em MODEL_PRICES — ver SUPABASE_STORAGE_PLAN_REFERENCE).
 */
export function resolvePrice(
  provider: UsageProvider,
  model: string,
  unit: ModelPrice["unit"],
  manualEntries: ManualPriceEntry[],
): ResolvedPrice {
  const official = isPriceableProvider(provider) ? findModelPrice(provider, model, unit) : undefined;
  if (official?.verified) {
    return { source: "OFFICIAL_VERIFIED", price: official.price, currency: official.currency, sourceUrl: official.sourceUrl, note: undefined };
  }

  const manual = manualEntries.find((entry) => entry.provider === provider && entry.model === model && entry.unit === unit && entry.active);
  if (manual) {
    const manualPrice = manual.inputCost ?? manual.outputCost ?? manual.imageComputeCost;
    if (manualPrice !== undefined) {
      return { source: "MANUAL", price: manualPrice, currency: manual.currency, sourceUrl: manual.source, note: manual.note };
    }
  }

  if (official) {
    return { source: "ESTIMATED", price: official.price, currency: official.currency, sourceUrl: official.sourceUrl, note: "Preço não reverificado ao vivo — conhecimento de treinamento, não fonte oficial confirmada." };
  }

  return { source: "UNAVAILABLE", price: undefined, currency: undefined, sourceUrl: undefined, note: undefined };
}
