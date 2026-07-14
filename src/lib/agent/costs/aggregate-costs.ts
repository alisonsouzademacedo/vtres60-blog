import type { UsageRow } from "./usage-repository";

export interface CostBreakdown {
  confirmedTotal: number;
  estimatedTotal: number;
  unavailableCount: number;
}

/**
 * Soma custos confirmed/estimated SEPARADAMENTE (Secao 34: "Nao misturar
 * custos antigos sem telemetria com custos novos" — aqui aplicado tambem a
 * nao misturar tokens reais precificados com estimativas de preco nao
 * verificado). unavailableCount nunca entra na soma — sem preco
 * cadastrado, o valor e desconhecido, nao zero.
 */
export function sumCosts(rows: UsageRow[]): CostBreakdown {
  let confirmedTotal = 0;
  let estimatedTotal = 0;
  let unavailableCount = 0;
  for (const row of rows) {
    if (row.costStatus === "confirmed") confirmedTotal += row.estimatedCost ?? 0;
    else if (row.costStatus === "estimated") estimatedTotal += row.estimatedCost ?? 0;
    else unavailableCount += 1;
  }
  return { confirmedTotal, estimatedTotal, unavailableCount };
}

/** count<=0 => undefined (nunca divide por zero) — painel mostra "—", não 0. */
export function averageCost(total: number, count: number): number | undefined {
  if (count <= 0) return undefined;
  return total / count;
}

export function publicationRate(publishedCount: number, totalRuns: number): number | undefined {
  if (totalRuns <= 0) return undefined;
  return publishedCount / totalRuns;
}

/** Projeta gasto de 30 dias a partir da média diária observada numa janela menor (ex: 7 dias). */
export function projectMonthlyCost(windowTotal: number, windowDays: number): number | undefined {
  if (windowDays <= 0) return undefined;
  return (windowTotal / windowDays) * 30;
}
