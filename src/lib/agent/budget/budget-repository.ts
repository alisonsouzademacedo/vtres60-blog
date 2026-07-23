import { supabaseAdmin } from "@/lib/supabase";
import type { BudgetMode, BudgetProvider } from "./circuit-breaker";

// Fase 9B.0 — leitura do estado do circuit breaker para o painel admin
// (/admin/custos). Best-effort: se as tabelas budget_* ainda nao
// existirem (migration nao aplicada em producao nesta fase), retorna
// estado vazio em vez de derrubar a pagina — mesmo padrao ja usado por
// listUsageSince/listRecentRuns antes da Fase 7 ser deployada.

export interface BudgetModeRow {
  provider: BudgetProvider;
  mode: BudgetMode;
}

export interface BudgetThresholdRow {
  provider: BudgetProvider;
  scope: "daily" | "monthly";
  limitType: "MONETARY_BUDGET" | "REQUEST_QUOTA";
  approvedThreshold: number | undefined;
  recommendedThreshold: number | undefined;
  currency: string;
}

export interface BudgetSpendRow {
  provider: BudgetProvider;
  dailySpent: number;
  monthlySpent: number;
  openReservations: number;
  lastBlockedAt: string | undefined;
  lastBlockReason: string | undefined;
}

const ALL_PROVIDERS: BudgetProvider[] = ["openai", "gnews", "replicate", "pexels", "supabase"];

export async function listBudgetModes(): Promise<BudgetModeRow[]> {
  const { data, error } = await supabaseAdmin.from("budget_mode").select("provider, mode");
  if (error) throw new Error(error.message);
  const byProvider = new Map((data ?? []).map((row) => [row.provider as BudgetProvider, row.mode as BudgetMode]));
  // provider sem linha na tabela = DISABLED por default (nunca bloqueou nada ainda).
  return ALL_PROVIDERS.map((provider) => ({ provider, mode: byProvider.get(provider) ?? "DISABLED" }));
}

export async function listBudgetThresholds(): Promise<BudgetThresholdRow[]> {
  const { data, error } = await supabaseAdmin
    .from("budget_thresholds")
    .select("provider, scope, limit_type, approved_threshold, recommended_threshold, currency")
    .eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    provider: row.provider,
    scope: row.scope,
    limitType: row.limit_type,
    approvedThreshold: row.approved_threshold ?? undefined,
    recommendedThreshold: row.recommended_threshold ?? undefined,
    currency: row.currency,
  }));
}

/**
 * Gasto diario/mensal por provider, calculado da MESMA forma que
 * reserve_provider_budget() calcula internamente (confirmed + reserved
 * ainda dentro do TTL de 5min) — para o admin ver exatamente o numero que
 * o guard usaria na proxima decisao, nao uma aproximacao diferente.
 */
export async function listBudgetSpend(): Promise<BudgetSpendRow[]> {
  const dayStart = new Date();
  dayStart.setUTCHours(dayStart.getUTCHours() - 3, 0, 0, 0); // aproximacao America/Sao_Paulo (UTC-3, sem horario de verao)
  if (dayStart.getTime() > Date.now()) dayStart.setUTCDate(dayStart.getUTCDate() - 1);
  const monthStart = new Date(dayStart);
  monthStart.setUTCDate(1);

  const ttlCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("budget_reservations")
    .select("provider, estimated_cost, actual_cost, status, reserved_at")
    .gte("reserved_at", monthStart.toISOString());
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  return ALL_PROVIDERS.map((provider) => {
    const providerRows = rows.filter((row) => row.provider === provider);
    const counted = providerRows.filter((row) => row.status === "confirmed" || (row.status === "reserved" && row.reserved_at >= ttlCutoff));
    const daily = counted.filter((row) => row.reserved_at >= dayStart.toISOString());
    const sum = (list: typeof counted) => list.reduce((acc, row) => acc + (row.actual_cost ?? row.estimated_cost ?? 0), 0);
    const openReservations = providerRows.filter((row) => row.status === "reserved" && row.reserved_at >= ttlCutoff).length;
    const blocked = providerRows.length; // placeholder — blocks nao viram linha em budget_reservations (so recordProviderUsage), ver lastBlockedAt abaixo
    void blocked;
    return {
      provider,
      dailySpent: sum(daily),
      monthlySpent: sum(counted),
      openReservations,
      lastBlockedAt: undefined,
      lastBlockReason: undefined,
    };
  });
}

/** Últimos bloqueios reais (allowed:false), a partir de agent_provider_usage (errorCode='BudgetExceededError') — mesma tabela onde os 3 pontos de integração já gravam esse evento. */
export async function listRecentBudgetBlocks(limit = 20): Promise<{ provider: BudgetProvider; operation: string; createdAt: string; reason: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_provider_usage")
    .select("provider, operation, created_at, error_message")
    .eq("error_code", "BudgetExceededError")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    provider: row.provider,
    operation: row.operation,
    createdAt: row.created_at,
    reason: row.error_message ?? "—",
  }));
}
