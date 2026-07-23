import { supabaseAdmin } from "@/lib/supabase";

// Fase 9B.0 — fronteira compartilhada de orcamento/circuit breaker. Toda
// chamada paga a um provider (OpenAI, GNews, Replicate, Pexels) deve
// reservar aqui ANTES de chamar o provider de verdade, e reconciliar (ou
// liberar) a reserva depois. Ver supabase-budget-enforcement-schema-fase9b0.sql
// para o modelo de dados/RPC — este modulo e so o client TypeScript.
//
// Por que reserva atomica e nao "SELECT SUM + IF em codigo de aplicacao":
// esse padrao tem uma janela de corrida real entre a leitura do gasto
// acumulado e a chamada ao provider — duas chamadas concorrentes podem
// ambas ler "abaixo do teto" e ambas passarem, estourando o orcamento.
// `reserve_provider_budget` faz a checagem E a reserva dentro da mesma
// funcao Postgres (atomica por natureza de uma unica invocacao de
// funcao), usando `select ... for update` numa linha de lock por
// provider para serializar reservas concorrentes do mesmo provider.

export type BudgetProvider = "openai" | "gnews" | "replicate" | "pexels" | "supabase";
export type BudgetMode = "DISABLED" | "AUDIT" | "ENFORCE";

export interface BudgetReservation {
  allowed: boolean;
  mode: BudgetMode;
  reservationId?: string;
  reason?: string;
  /** true quando o proprio guard falhou (Supabase indisponivel, RPC com erro) e a chamada foi liberada por policy de falha, nao por estar dentro do teto. */
  degraded?: boolean;
  dailySpent?: number;
  monthlySpent?: number;
}

interface RpcReserveResponse {
  allowed: boolean;
  mode: BudgetMode;
  reservation_id?: string;
  reason?: string;
  daily_spent?: number;
  monthly_spent?: number;
}

/**
 * Excecao lancada quando o guard bloqueia uma chamada em modo ENFORCE.
 * Propaga naturalmente ate o catch-all generico de cada rota de disparo
 * do agente (`cron/route.ts`, `trigger/route.ts`,
 * `admin/agent/stream/route.ts`), que ja grava `terminal_reason:
 * "operational_error"` com a mensagem real em `providerErrors.agent` —
 * nao precisou de nenhum novo valor de terminal_reason nem mudanca nessas
 * rotas (ver docs/implementacao-fase9b0-controle-orcamento.md, secao
 * "terminal_reason avaliado e nao adicionado").
 */
export class BudgetExceededError extends Error {
  constructor(
    public readonly reason: string,
    public readonly provider: BudgetProvider,
  ) {
    super(`Orçamento excedido para ${provider}: ${reason}`);
    this.name = "BudgetExceededError";
  }
}

/**
 * Fail policy = DEGRADED_MODE: se o RPC do guard falhar por qualquer
 * motivo (Supabase indisponivel, erro de rede, tabela ausente antes da
 * migration ser aplicada), a chamada e liberada (`allowed:true`) mas
 * marcada `degraded:true` e logada. Justificativa: em ENFORCE, bloquear o
 * caminho de publicacao ao vivo (cron 2x/dia, producao real) por uma
 * falha de infraestrutura do PROPRIO guard seria pior que o risco que o
 * guard existe para mitigar — o gasto mensal confirmado hoje e ~US$2,58
 * (Fase 9A), nao ha cenario onde uma degradacao curta custe mais do que
 * uma publicacao real perdida. Nunca falha silenciosamente: o evento fica
 * em log de erro e o chamador pode expor `degraded` no admin.
 */
export async function checkAndReserveBudget(params: {
  provider: BudgetProvider;
  operation: string;
  estimatedCost: number;
  runId?: string;
}): Promise<BudgetReservation> {
  try {
    const { data, error } = await supabaseAdmin.rpc("reserve_provider_budget", {
      p_provider: params.provider,
      p_operation: params.operation,
      p_estimated_cost: params.estimatedCost,
      p_run_id: params.runId ?? null,
    });
    if (error) throw new Error(error.message);
    const result = data as RpcReserveResponse;
    return {
      allowed: result.allowed,
      mode: result.mode,
      reservationId: result.reservation_id,
      reason: result.reason,
      dailySpent: result.daily_spent,
      monthlySpent: result.monthly_spent,
    };
  } catch (error) {
    console.error("[budget-guard] reserve_provider_budget falhou — degradando aberto (DEGRADED_MODE)", error);
    return { allowed: true, mode: "ENFORCE", degraded: true, reason: "guard_unavailable" };
  }
}

/** Fecha a reserva com o custo real. Best-effort: falha aqui nunca derruba o node — a reserva expira sozinha em 5min (ver migration) e para de contar para o gasto. */
export async function reconcileBudget(reservationId: string | undefined, actualCost: number | undefined): Promise<void> {
  if (!reservationId) return;
  try {
    const { error } = await supabaseAdmin.rpc("reconcile_provider_budget", {
      p_reservation_id: reservationId,
      p_actual_cost: actualCost ?? 0,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[budget-guard] reconcile_provider_budget falhou — reserva expira sozinha em 5min", error);
  }
}

/** Libera uma reserva sem custo — chamada nunca aconteceu (outro gate bloqueou antes do provider). */
export async function releaseBudget(reservationId: string | undefined): Promise<void> {
  if (!reservationId) return;
  try {
    const { error } = await supabaseAdmin.rpc("release_provider_budget", { p_reservation_id: reservationId });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[budget-guard] release_provider_budget falhou — reserva expira sozinha em 5min", error);
  }
}

/**
 * Helper de conveniencia: reserva, executa `call`, reconcilia com o custo
 * real (via `computeActualCost`, chamado so em sucesso) e relança
 * `BudgetExceededError` quando bloqueado. Em falha de `call`, libera a
 * reserva (custo zero — nao houve consumo real do provider, mesma
 * simplificacao ja usada em `calculateReplicateImageCost` para predicoes
 * que falham).
 */
export async function withBudgetGuard<T>(
  params: { provider: BudgetProvider; operation: string; estimatedCost: number; runId?: string },
  call: () => Promise<T>,
  computeActualCost: (result: T) => number | undefined,
): Promise<T> {
  const reservation = await checkAndReserveBudget(params);
  if (!reservation.allowed) {
    throw new BudgetExceededError(reservation.reason ?? "unknown", params.provider);
  }
  try {
    const result = await call();
    await reconcileBudget(reservation.reservationId, computeActualCost(result));
    return result;
  } catch (error) {
    await releaseBudget(reservation.reservationId);
    throw error;
  }
}
