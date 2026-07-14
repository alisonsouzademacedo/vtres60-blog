import { AdminPageHeading } from "@/components/admin/page-heading";
import { AgentConsole } from "@/components/admin/agent-console";
import { AgentOperationsSummary } from "@/components/admin/agent-operations-summary";
import { ProviderHealthPanel } from "@/components/admin/provider-health-panel";
import { listRecentRuns } from "@/lib/agent/agent-runs-repository";
import { getCachedProviderHealth } from "@/lib/agent/health/provider-health";
import { nextScheduledRun } from "@/lib/agent/next-scheduled-run";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page() {
  const logs = await operationsRepository.listLogs();
  const history = logs.filter((item) => item.module === "agente");

  // telemetryAvailable=false quando agent_runs ainda nao existe (migration
  // supabase-agent-runs-schema.sql pendente em producao nesta fase) — a
  // pagina nao pode quebrar so porque a tabela ainda nao foi aplicada.
  const recentRuns = await listRecentRuns(20).catch(() => null);
  const telemetryAvailable = recentRuns !== null;
  const runs = recentRuns ?? [];
  const lastRun = runs[0];
  const lastPublishedRun = runs.find((run) => run.status === "published");
  const lastPublishedPost = lastPublishedRun?.publishedPostId
    ? await editorialRepository.getPost(lastPublishedRun.publishedPostId).catch(() => undefined)
    : undefined;
  const { providers, cached } = await getCachedProviderHealth();

  return (
    <>
      <AdminPageHeading
        eyebrow="Operação"
        title="Agente Autônomo"
        description="Envie uma notícia para o agente e acompanhe a redação, auditoria e publicação em tempo real."
      />
      <AgentOperationsSummary
        telemetryAvailable={telemetryAvailable}
        nextRunAt={nextScheduledRun().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        })}
        lastRun={lastRun}
        lastPublishedRun={lastPublishedRun}
        lastPublishedPostTitle={lastPublishedPost?.title}
        lastPublishedPostSlug={lastPublishedPost?.slug}
        recentRuns={runs}
      />
      <ProviderHealthPanel providers={providers} cached={cached} />
      <AgentConsole history={history} />
    </>
  );
}
