function formatUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  return `US$ ${value.toFixed(4)}`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${(value * 100).toFixed(0)}%`;
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
  publicationRatePercent,
  projectedMonthlyCost,
  runsCount,
  publishedCount,
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
  publicationRatePercent: number | undefined;
  projectedMonthlyCost: number | undefined;
  runsCount: number;
  publishedCount: number;
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
                ? `Dados desde ${formatDate(oldestDataSince)}. Valores em USD, moeda nativa dos providers (sem conversão automática para BRL — ver observação abaixo).`
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
        </div>
      </section>
    </>
  );
}
