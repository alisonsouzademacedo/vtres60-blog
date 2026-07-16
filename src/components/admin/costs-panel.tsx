import type { ProviderCostRow } from "@/lib/agent/costs/aggregate-costs";
import type { UsageProvider, UsageRow } from "@/lib/agent/costs/usage-repository";
import type { ProviderHealthStatus } from "@/lib/agent/health/provider-health";

function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return `US$ ${value.toFixed(4)}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

const PROVIDER_LABELS: Record<UsageProvider, string> = {
  openai: "OpenAI",
  gnews: "GNews",
  replicate: "Replicate",
  pexels: "Pexels",
  supabase: "Supabase",
};

const HEALTH_STATUS_LABELS: Record<ProviderHealthStatus, string> = {
  healthy: "Saudável",
  degraded: "Degradado",
  unavailable: "Indisponível",
  not_configured: "Não configurado",
  billing_unknown: "Billing desconhecido",
};

export interface EstimatedBalanceRow {
  provider: UsageProvider;
  initialValue: number;
  consumedSinceInitialDate: number;
  estimatedBalance: number;
  currency: string;
  initialDate: string;
}

export function CostsPanel({
  telemetryAvailable,
  oldestDataSince,
  costLast7d,
  costLast30d,
  confirmedTotal30d,
  estimatedTotal30d,
  unavailableCount30d,
  averageCostPerRun,
  averageCostPerPublication,
  averageCostPerRejectedRun,
  publicationRatePercent,
  projectedMonthlyCost,
  runsCount,
  publishedCount,
  providerBreakdown30d,
  recentFailures,
  estimatedBalances,
  degradedProviders,
  manualPricesCount,
}: {
  telemetryAvailable: boolean;
  oldestDataSince: string | undefined;
  costLast7d: number;
  costLast30d: number;
  confirmedTotal30d: number;
  estimatedTotal30d: number;
  unavailableCount30d: number;
  averageCostPerRun: number | undefined;
  averageCostPerPublication: number | undefined;
  averageCostPerRejectedRun: number | undefined;
  publicationRatePercent: number | undefined;
  projectedMonthlyCost: number | undefined;
  runsCount: number;
  publishedCount: number;
  providerBreakdown30d: ProviderCostRow[];
  recentFailures: UsageRow[];
  estimatedBalances: EstimatedBalanceRow[];
  degradedProviders: { provider: UsageProvider; status: ProviderHealthStatus; detail: string }[];
  manualPricesCount: number;
}) {
  return (
    <>
      {!telemetryAvailable && (
        <div className="admin-feedback" data-error="true">
          Telemetria de custos (tabelas agent_runs/agent_provider_usage) ainda não está disponível neste ambiente —
          as migrations supabase-agent-runs-schema.sql e supabase-provider-usage-schema.sql ainda não foram
          aplicadas em produção nesta fase.
        </div>
      )}

      <section className="admin-card">
        <header>
          <div>
            <h2>Resumo financeiro</h2>
            <p>
              {oldestDataSince
                ? `Dados desde ${formatDate(oldestDataSince)}. Valores em USD, moeda nativa dos providers — sem taxa de câmbio cadastrada, nenhuma conversão para BRL é exibida (ver Saldo estimado abaixo).`
                : "Ainda não há execuções com telemetria registrada."}
            </p>
          </div>
        </header>
        <div className="admin-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <div className="admin-field">
            <label>Custo — últimos 7 dias</label>
            <p>{formatUsd(costLast7d)}</p>
          </div>
          <div className="admin-field">
            <label>Custo — últimos 30 dias</label>
            <p>{formatUsd(costLast30d)}</p>
          </div>
          <div className="admin-field">
            <label>Projeção mensal (base 7d)</label>
            <p>{formatUsd(projectedMonthlyCost)}</p>
          </div>
          <div className="admin-field">
            <label>Custo médio por execução</label>
            <p>{formatUsd(averageCostPerRun)}</p>
          </div>
          <div className="admin-field">
            <label>Custo médio por publicação</label>
            <p>{formatUsd(averageCostPerPublication)}</p>
          </div>
          <div className="admin-field">
            <label>Custo médio — execução rejeitada</label>
            <p>{formatUsd(averageCostPerRejectedRun)}</p>
          </div>
          <div className="admin-field">
            <label>Taxa de publicação (30d)</label>
            <p>
              {formatPercent(publicationRatePercent)} ({publishedCount}/{runsCount} execuções)
            </p>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <header>
          <div>
            <h2>Confiabilidade dos números (30 dias)</h2>
            <p>Confirmado = tokens reais do provider. Estimado = preço não reverificado ao vivo ou custo por unidade fixa. Nunca somados sem distinção.</p>
          </div>
        </header>
        <div className="admin-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          <div className="admin-field">
            <label>Confirmado</label>
            <p>{formatUsd(confirmedTotal30d)}</p>
          </div>
          <div className="admin-field">
            <label>Estimado</label>
            <p>{formatUsd(estimatedTotal30d)}</p>
          </div>
          <div className="admin-field">
            <label>Sem preço cadastrado</label>
            <p>{unavailableCount30d} chamada(s)</p>
          </div>
          <div className="admin-field">
            <label>Preços manuais cadastrados</label>
            <p>{manualPricesCount}</p>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <header>
          <div>
            <h2>Saldo</h2>
            <p>
              Nenhum provider usado por este pipeline expõe saldo/crédito real através das chaves configuradas — por
              isso não existe &quot;Saldo oficial&quot; nesta fase. Abaixo, apenas Saldo estimado (orçamento inicial
              cadastrado manualmente menos consumo calculado desde a data de referência).
            </p>
          </div>
        </header>
        {estimatedBalances.length === 0 ? (
          <div className="admin-empty">
            <h2>Nenhum orçamento estimado configurado</h2>
            <p>Cadastre um orçamento inicial por provider em Custos → Configurações para calcular saldo estimado aqui.</p>
          </div>
        ) : (
          <div className="admin-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {estimatedBalances.map((balance) => (
              <div className="admin-field" key={balance.provider}>
                <label>
                  {PROVIDER_LABELS[balance.provider]} — Saldo estimado (desde {formatDate(balance.initialDate)})
                </label>
                <p>
                  {balance.currency} {balance.estimatedBalance.toFixed(2)}
                  <br />
                  <small>
                    Inicial: {balance.currency} {balance.initialValue.toFixed(2)} · Consumido: {balance.currency}{" "}
                    {balance.consumedSinceInitialDate.toFixed(4)}
                  </small>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card">
        <header>
          <div>
            <h2>Providers degradados</h2>
            <p>Estado do último health check (cache de 60s) — ver também Operação do Agente.</p>
          </div>
        </header>
        {degradedProviders.length === 0 ? (
          <p>Todos os providers saudáveis na última verificação.</p>
        ) : (
          <div className="admin-table">
            {degradedProviders.map((provider) => (
              <article className="admin-table-row" key={provider.provider}>
                <div className="admin-table-title">
                  <b>{PROVIDER_LABELS[provider.provider]}</b>
                  <small>{provider.detail}</small>
                </div>
                <span className="admin-status" data-status={provider.status}>
                  {HEALTH_STATUS_LABELS[provider.status]}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card">
        <header>
          <div>
            <h2>Por provider (30 dias)</h2>
            <p>Custo, chamadas e falhas — quota/saldo por provider ficam em Operação do Agente / Providers degradados acima.</p>
          </div>
        </header>
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Provider</span>
            <span>Confirmado</span>
            <span>Estimado</span>
            <span>Chamadas</span>
            <span>Falhas</span>
          </div>
          {providerBreakdown30d.map((row) => (
            <article className="admin-table-row" key={row.provider}>
              <div className="admin-table-title">
                <b>{PROVIDER_LABELS[row.provider]}</b>
              </div>
              <span className="admin-table-meta">{formatUsd(row.confirmedTotal)}</span>
              <span className="admin-table-meta">{formatUsd(row.estimatedTotal)}</span>
              <span className="admin-table-meta">{row.callCount}</span>
              <span className="admin-table-meta">{row.failureCount}</span>
            </article>
          ))}
          {providerBreakdown30d.length === 0 && (
            <div className="admin-empty">
              <h2>Nenhuma chamada registrada</h2>
              <p>Sem telemetria nos últimos 30 dias.</p>
            </div>
          )}
        </div>
      </section>

      <section className="admin-card">
        <header>
          <div>
            <h2>Falhas recentes (30 dias)</h2>
            <p>Últimas 20 chamadas com success=false — erro normalizado e sanitizado, nunca o corpo bruto da resposta.</p>
          </div>
        </header>
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Quando</span>
            <span>Provider / operação</span>
            <span>Erro</span>
          </div>
          {recentFailures.map((row) => (
            <article className="admin-table-row" key={row.id}>
              <span className="admin-table-meta">{formatDateTime(row.createdAt)}</span>
              <div className="admin-table-title">
                <b>
                  {PROVIDER_LABELS[row.provider]} · {row.operation}
                </b>
                <small>{row.errorCode ?? "—"}</small>
              </div>
              <span className="admin-table-meta">{row.errorMessage ?? "—"}</span>
            </article>
          ))}
          {recentFailures.length === 0 && (
            <div className="admin-empty">
              <h2>Nenhuma falha registrada</h2>
              <p>Todas as chamadas dos últimos 30 dias tiveram sucesso.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
