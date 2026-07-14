import { AdminPageHeading } from "@/components/admin/page-heading";
import { CostsPanel } from "@/components/admin/costs-panel";
import { listUsageSince } from "@/lib/agent/costs/usage-repository";
import { listRecentRuns } from "@/lib/agent/agent-runs-repository";
import { averageCost, projectMonthlyCost, publicationRate, sumCosts } from "@/lib/agent/costs/aggregate-costs";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function CustosPage() {
  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const [usage7d, usage30d, runs30d] = await Promise.all([
    listUsageSince(since7d).catch(() => null),
    listUsageSince(since30d).catch(() => null),
    listRecentRuns(500).catch(() => null),
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
  const oldestRunDate = runs.length > 0 ? runs[runs.length - 1].createdAt : undefined;

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
        averageCostPerPublication={averageCost(total30d, publishedRuns.length)}
        publicationRatePercent={publicationRate(publishedRuns.length, runs.length)}
        projectedMonthlyCost={projectMonthlyCost(total7d, 7)}
        runsCount={runs.length}
        publishedCount={publishedRuns.length}
      />
    </>
  );
}
