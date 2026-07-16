import { AdminPageHeading } from "@/components/admin/page-heading";
import { CostsPanel } from "@/components/admin/costs-panel";
import { listUsageSince } from "@/lib/agent/costs/usage-repository";
import { listRecentRuns } from "@/lib/agent/agent-runs-repository";
import {
  averageCost,
  averageCostForRuns,
  costByRunId,
  groupCostsByProvider,
  projectMonthlyCost,
  publicationRate,
  sumCosts,
} from "@/lib/agent/costs/aggregate-costs";
import { listActiveBudgets, listManualPrices, listCurrencyRates } from "@/lib/agent/costs/cost-settings-repository";
import { calculateEstimatedBalance } from "@/lib/agent/costs/estimated-balance";
import { getCachedProviderHealth } from "@/lib/agent/health/provider-health";
import { CostSettingsForm } from "@/components/admin/cost-settings-form";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function CustosPage() {
  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const [usage7d, usage30d, runs30d, budgets, manualPrices, currencyRates, health] = await Promise.all([
    listUsageSince(since7d).catch(() => null),
    listUsageSince(since30d).catch(() => null),
    listRecentRuns(500).catch(() => null),
    listActiveBudgets().catch(() => []),
    listManualPrices().catch(() => []),
    listCurrencyRates().catch(() => []),
    getCachedProviderHealth().catch(() => ({ providers: [], cached: false })),
  ]);

  const telemetryAvailable = usage7d !== null && usage30d !== null;
  const rows7d = usage7d ?? [];
  const rows30d = usage30d ?? [];
  const runs = runs30d ?? [];

  const breakdown7d = sumCosts(rows7d);
  const breakdown30d = sumCosts(rows30d);
  const total30d = breakdown30d.confirmedTotal + breakdown30d.estimatedTotal;
  const total7d = breakdown7d.confirmedTotal + breakdown7d.estimatedTotal;

  const publishedRuns = runs.filter((run) => run.status === "published");
  const rejectedRuns = runs.filter((run) => run.status === "rejected");
  const oldestRunDate = runs.length > 0 ? runs[runs.length - 1].createdAt : undefined;

  // custo médio por publicação/rejeição soma TODAS as linhas de custo do
  // run (Drafter + InternalAuditor com retries etc), não só uma chamada —
  // ver costByRunId (Secao 8/21).
  const costByRun = costByRunId(rows30d);
  const averageCostPerPublication = averageCostForRuns(
    publishedRuns.map((run) => run.id),
    costByRun,
  );
  const averageCostPerRejectedRun = averageCostForRuns(
    rejectedRuns.map((run) => run.id),
    costByRun,
  );

  const providerBreakdown30d = groupCostsByProvider(rows30d);
  const recentFailures = rows30d.filter((row) => !row.success).slice(0, 20);

  // Saldo ESTIMADO por provider com orçamento ativo configurado (Secao 15)
  // — nunca "oficial": nenhum provider desta lista expõe um endpoint de
  // saldo real através das chaves usadas por este projeto (confirmado no
  // checkpoint da Fase 7).
  const estimatedBalances = budgets.map((budget) => {
    const sinceInitialDate = new Date(budget.initialDate).toISOString();
    const usageForProvider = rows30d.filter((row) => row.provider === budget.provider && row.createdAt >= sinceInitialDate);
    return {
      provider: budget.provider,
      ...calculateEstimatedBalance({
        initialValue: budget.initialValue,
        initialDate: budget.initialDate,
        currency: budget.currency,
        usageSinceInitialDate: usageForProvider,
      }),
    };
  });

  const degradedProviders = health.providers.filter((provider) => provider.status !== "healthy");

  return (
    <>
      <AdminPageHeading
        eyebrow="Operação"
        title="Custos e APIs"
        description="Consumo e custo estimado dos providers de IA/dados do agente autônomo."
      />
      <CostsPanel
        telemetryAvailable={telemetryAvailable}
        oldestDataSince={oldestRunDate}
        costLast7d={total7d}
        costLast30d={total30d}
        confirmedTotal30d={breakdown30d.confirmedTotal}
        estimatedTotal30d={breakdown30d.estimatedTotal}
        unavailableCount30d={breakdown30d.unavailableCount}
        averageCostPerRun={averageCost(total30d, runs.length)}
        averageCostPerPublication={averageCostPerPublication}
        averageCostPerRejectedRun={averageCostPerRejectedRun}
        publicationRatePercent={publicationRate(publishedRuns.length, runs.length)}
        projectedMonthlyCost={projectMonthlyCost(total7d, 7)}
        runsCount={runs.length}
        publishedCount={publishedRuns.length}
        providerBreakdown30d={providerBreakdown30d}
        recentFailures={recentFailures}
        estimatedBalances={estimatedBalances}
        degradedProviders={degradedProviders.map((provider) => ({ provider: provider.provider, status: provider.status, detail: provider.detail }))}
        manualPricesCount={manualPrices.length}
      />
      <section className="admin-card">
        <header>
          <div>
            <h2>Configurações financeiras manuais</h2>
            <p>
              Preços manuais, orçamento/crédito inicial e câmbio manual — usados nos painéis acima conforme a
              precedência OFFICIAL_VERIFIED &gt; MANUAL &gt; ESTIMATED &gt; UNAVAILABLE (ver resolve-price.ts).
            </p>
          </div>
        </header>
        <CostSettingsForm initialPrices={manualPrices} initialBudgets={budgets} initialCurrencyRates={currencyRates} />
      </section>
    </>
  );
}
