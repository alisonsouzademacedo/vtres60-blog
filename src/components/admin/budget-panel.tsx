import type { BudgetModeRow, BudgetSpendRow, BudgetThresholdRow } from "@/lib/agent/budget/budget-repository";
import type { BudgetProvider } from "@/lib/agent/budget/circuit-breaker";

function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return `US$ ${value.toFixed(4)}`;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

const PROVIDER_LABELS: Record<BudgetProvider, string> = {
  openai: "OpenAI",
  gnews: "GNews",
  replicate: "Replicate",
  pexels: "Pexels",
  supabase: "Supabase",
};

const MODE_LABELS: Record<BudgetModeRow["mode"], string> = {
  DISABLED: "Desabilitado",
  AUDIT: "Auditoria (não bloqueia)",
  ENFORCE: "Ativo (bloqueia)",
};

export interface RecentBudgetBlock {
  provider: BudgetProvider;
  operation: string;
  createdAt: string;
  reason: string;
}

/**
 * Fase 9B.0 — painel do circuit breaker de orçamento. Somente leitura
 * nesta fase (mudar modo/teto é uma decisão editorial/financeira de
 * Pedro, não algo a automatizar aqui — ver Parte VI/critério
 * `THRESHOLDS_CONFIGURED` do plano mestre). Nunca exibe secrets, prompts
 * ou conteúdo integral de notícias — só provider/operação/valores/datas.
 */
export function BudgetPanel({
  available,
  modes,
  thresholds,
  spend,
  recentBlocks,
}: {
  available: boolean;
  modes: BudgetModeRow[];
  thresholds: BudgetThresholdRow[];
  spend: BudgetSpendRow[];
  recentBlocks: RecentBudgetBlock[];
}) {
  if (!available) {
    return (
      <section className="admin-card">
        <header>
          <div>
            <h2>Controle de orçamento (circuit breaker)</h2>
            <p>
              Tabelas <code>budget_mode</code>/<code>budget_thresholds</code>/<code>budget_reservations</code> ainda
              não estão disponíveis neste ambiente — <code>supabase-budget-enforcement-schema-fase9b0.sql</code>{" "}
              ainda não foi aplicada em produção nesta fase.
            </p>
          </div>
        </header>
      </section>
    );
  }

  const spendByProvider = new Map(spend.map((row) => [row.provider, row]));
  const thresholdsByProvider = new Map<BudgetProvider, BudgetThresholdRow[]>();
  for (const threshold of thresholds) {
    const list = thresholdsByProvider.get(threshold.provider) ?? [];
    list.push(threshold);
    thresholdsByProvider.set(threshold.provider, list);
  }

  return (
    <section className="admin-card">
      <header>
        <div>
          <h2>Controle de orçamento (circuit breaker)</h2>
          <p>
            Toda chamada paga a um provider passa por uma reserva atômica antes de acontecer (ver{" "}
            <code>docs/runbook-budget-enforcement.md</code>). Nenhum provider tem teto aprovado ainda — modos
            partem em <strong>Desabilitado</strong> por design, até Pedro aprovar um valor.
          </p>
        </div>
      </header>
      <div className="admin-table">
        <div className="admin-table-head">
          <span>Provider</span>
          <span>Modo</span>
          <span>Gasto hoje</span>
          <span>Gasto no mês</span>
          <span>Teto diário</span>
          <span>Teto mensal</span>
          <span>Reservas abertas</span>
        </div>
        {modes.map((modeRow) => {
          const providerSpend = spendByProvider.get(modeRow.provider);
          const providerThresholds = thresholdsByProvider.get(modeRow.provider) ?? [];
          const dailyThreshold = providerThresholds.find((t) => t.scope === "daily" && t.limitType === "MONETARY_BUDGET");
          const monthlyThreshold = providerThresholds.find((t) => t.scope === "monthly" && t.limitType === "MONETARY_BUDGET");
          return (
            <article className="admin-table-row" key={modeRow.provider}>
              <div className="admin-table-title">
                <b>{PROVIDER_LABELS[modeRow.provider]}</b>
              </div>
              <span className="admin-table-meta">{MODE_LABELS[modeRow.mode]}</span>
              <span className="admin-table-meta">{formatUsd(providerSpend?.dailySpent)}</span>
              <span className="admin-table-meta">{formatUsd(providerSpend?.monthlySpent)}</span>
              <span className="admin-table-meta">{dailyThreshold?.approvedThreshold !== undefined ? formatUsd(dailyThreshold.approvedThreshold) : "Nenhum aprovado"}</span>
              <span className="admin-table-meta">{monthlyThreshold?.approvedThreshold !== undefined ? formatUsd(monthlyThreshold.approvedThreshold) : "Nenhum aprovado"}</span>
              <span className="admin-table-meta">{providerSpend?.openReservations ?? 0}</span>
            </article>
          );
        })}
      </div>

      <h3>Últimos bloqueios</h3>
      {recentBlocks.length === 0 ? (
        <div className="admin-empty">
          <h2>Nenhum bloqueio</h2>
          <p>Nenhuma chamada foi bloqueada pelo circuit breaker até agora.</p>
        </div>
      ) : (
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Quando</span>
            <span>Provider</span>
            <span>Operação</span>
            <span>Motivo</span>
          </div>
          {recentBlocks.map((block, index) => (
            <article className="admin-table-row" key={`${block.provider}-${block.createdAt}-${index}`}>
              <div className="admin-table-title">
                <b>{formatDateTime(block.createdAt)}</b>
              </div>
              <span className="admin-table-meta">{PROVIDER_LABELS[block.provider]}</span>
              <span className="admin-table-meta">{block.operation}</span>
              <span className="admin-table-meta">{block.reason}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
