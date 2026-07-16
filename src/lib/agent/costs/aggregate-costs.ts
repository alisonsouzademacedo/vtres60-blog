import type { UsageProvider, UsageRow } from "./usage-repository";

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

/**
 * Soma o custo (confirmed+estimated; unavailable nunca vira número) por
 * run_id — uma execução pode ter varias linhas em agent_provider_usage
 * (Drafter + InternalAuditor com retries etc), e o painel precisa do total
 * POR EXECUÇÃO para calcular custo médio por publicação/rejeição (Secao
 * 21), não custo médio por CHAMADA.
 */
export function costByRunId(rows: UsageRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.runId || row.costStatus === "unavailable") continue;
    totals.set(row.runId, (totals.get(row.runId) ?? 0) + (row.estimatedCost ?? 0));
  }
  return totals;
}

/** Custo médio de um subconjunto de execuções (ex: só as rejeitadas) — runs sem nenhuma linha de custo contam como 0, não são ignorados. */
export function averageCostForRuns(runIds: string[], costByRun: Map<string, number>): number | undefined {
  if (runIds.length === 0) return undefined;
  const total = runIds.reduce((sum, id) => sum + (costByRun.get(id) ?? 0), 0);
  return total / runIds.length;
}

export interface ProviderCostRow {
  provider: UsageProvider;
  confirmedTotal: number;
  estimatedTotal: number;
  unavailableCount: number;
  callCount: number;
  failureCount: number;
}

/** Quebra de custo/uso por provider (Secao 21: tabela "por provider"). */
export function groupCostsByProvider(rows: UsageRow[]): ProviderCostRow[] {
  const byProvider = new Map<UsageProvider, UsageRow[]>();
  for (const row of rows) {
    const list = byProvider.get(row.provider) ?? [];
    list.push(row);
    byProvider.set(row.provider, list);
  }
  return Array.from(byProvider.entries())
    .map(([provider, providerRows]) => ({
      provider,
      ...sumCosts(providerRows),
      callCount: providerRows.length,
      failureCount: providerRows.filter((row) => !row.success).length,
    }))
    .sort((a, b) => b.confirmedTotal + b.estimatedTotal - (a.confirmedTotal + a.estimatedTotal));
}
