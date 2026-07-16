import { sumCosts } from "./aggregate-costs";
import type { UsageRow } from "./usage-repository";

// Fase 7 (Secao 15) — saldo ESTIMADO = credito/orcamento inicial manual
// (provider_budget_settings) menos o consumo calculado desde a data
// inicial. Rotulado SEMPRE "Saldo estimado" no painel, nunca "oficial" —
// so providers com balance endpoint real (nenhum confirmado nesta fase,
// ver checkpoint da Secao 33) teriam direito ao rotulo "oficial".
export interface EstimatedBalanceResult {
  initialValue: number;
  consumedSinceInitialDate: number;
  estimatedBalance: number;
  currency: string;
  initialDate: string;
}

/**
 * `usageSinceInitialDate` deve ja vir filtrado (provider + created_at >=
 * initialDate) pelo chamador — esta funcao so soma, nao consulta o banco
 * (mantido puro/testavel, mesmo padrao de aggregate-costs.ts). Soma
 * confirmed+estimated (nao inclui unavailable, que nunca vira número).
 */
export function calculateEstimatedBalance(params: {
  initialValue: number;
  initialDate: string;
  currency: string;
  usageSinceInitialDate: UsageRow[];
}): EstimatedBalanceResult {
  const { confirmedTotal, estimatedTotal } = sumCosts(params.usageSinceInitialDate);
  const consumedSinceInitialDate = confirmedTotal + estimatedTotal;
  return {
    initialValue: params.initialValue,
    consumedSinceInitialDate,
    estimatedBalance: params.initialValue - consumedSinceInitialDate,
    currency: params.currency,
    initialDate: params.initialDate,
  };
}
