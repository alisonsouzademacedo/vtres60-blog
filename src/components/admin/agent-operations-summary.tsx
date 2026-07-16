import Link from "next/link";
import type { AgentRun } from "@/lib/agent/agent-runs-repository";

const STATUS_LABELS: Record<string, string> = {
  running: "Execução não concluída",
  published: "Publicado",
  draft: "Rascunho (revisão)",
  rejected: "Sem publicação",
  failed: "Falha operacional",
};

// Rotulos em portugues pedidos pela Fase 6 (Secao 8) — cobrem todos os
// terminal_reason validos definidos em supabase-agent-runs-schema.sql.
const TERMINAL_REASON_LABELS: Record<string, string> = {
  published: "Publicado com sucesso",
  draft_pending_review: "Rascunho aguardando revisão humana",
  auditor_rejected_saved_as_draft: "Auditoria reprovou — salvo como rascunho de emergência",
  exact_duplicate: "Duplicado exato",
  not_newsworthy: "Pauta sem caráter noticioso",
  same_event_no_material_update: "Sem novidade material",
  classification_failed: "Falha de classificação",
  image_pipeline_failed: "Falha na imagem",
  no_candidate: "Nenhuma candidata encontrada",
  candidates_exhausted: "Todas as candidatas esgotadas",
  provider_unavailable: "Provedor indisponível",
  operational_error: "Falha operacional",
};

function reasonLabel(run: Pick<AgentRun, "status" | "terminalReason">): string {
  if (run.status === "running") return "Execução não concluída";
  if (!run.terminalReason) return "—";
  return TERMINAL_REASON_LABELS[run.terminalReason] ?? run.terminalReason;
}

// Fase 7 (Secao 20) — reusa os mesmos rotulos de terminal_reason para o
// motivo de rejeicao POR CANDIDATA (candidateHistory), ja que os 4 valores
// possiveis (exact_duplicate/not_newsworthy/same_event_no_material_update/
// image_pipeline_failed) sao um subconjunto do mesmo vocabulario.
function candidateReasonLabel(reason: string): string {
  return TERMINAL_REASON_LABELS[reason] ?? reason;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AgentOperationsSummary({
  telemetryAvailable,
  nextRunAt,
  lastRun,
  lastPublishedRun,
  lastPublishedPostTitle,
  lastPublishedPostSlug,
  recentRuns,
}: {
  telemetryAvailable: boolean;
  nextRunAt: string;
  lastRun?: AgentRun;
  lastPublishedRun?: AgentRun;
  lastPublishedPostTitle?: string;
  lastPublishedPostSlug?: string;
  recentRuns: AgentRun[];
}) {
  return (
    <section className="admin-card">
      <header>
        <div>
          <h2>Operação do agente</h2>
          <p>Cron configurado, última execução e histórico estruturado — sem precisar consultar o servidor diretamente.</p>
        </div>
      </header>

      {!telemetryAvailable && (
        <div className="admin-feedback" data-error="true">
          Telemetria estruturada (tabela agent_runs) ainda não está disponível neste ambiente — a migration
          supabase-agent-runs-schema.sql ainda não foi aplicada em produção. Os campos abaixo ficam vazios até lá;
          a aba &quot;Histórico de execuções&quot; (texto livre) continua funcionando normalmente enquanto isso.
        </div>
      )}

      <div className="admin-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <div className="admin-field">
          <label>Cron configurado</label>
          <p>05:00 e 17:00 (América/São Paulo)</p>
        </div>
        <div className="admin-field">
          <label>Próxima execução calculada</label>
          <p>{nextRunAt}</p>
        </div>
        <div className="admin-field">
          <label>Última execução</label>
          <p>
            {lastRun ? (
              <>
                <span className="admin-status" data-status={lastRun.status}>
                  {STATUS_LABELS[lastRun.status] ?? lastRun.status}
                </span>{" "}
                {formatDateTime(lastRun.startedAt)} · {formatDuration(lastRun.durationMs)}
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="admin-field">
          <label>Motivo da última execução</label>
          <p>{lastRun ? reasonLabel(lastRun) : "—"}</p>
        </div>
        <div className="admin-field">
          <label>Última publicação</label>
          <p>
            {lastPublishedRun ? (
              <>
                {lastPublishedPostSlug ? (
                  <Link href={`/noticias/${lastPublishedPostSlug}`} target="_blank">
                    {lastPublishedPostTitle ?? lastPublishedRun.candidateTitle ?? "Post"}
                  </Link>
                ) : (
                  (lastPublishedPostTitle ?? lastPublishedRun.candidateTitle ?? "—")
                )}{" "}
                — {formatDateTime(lastPublishedRun.finishedAt)}
              </>
            ) : (
              "Nenhuma publicação registrada ainda."
            )}
          </p>
        </div>
      </div>

      <section className="admin-table" style={{ marginTop: 18 }}>
        <div className="admin-table-head">
          <span>Execução</span>
          <span>Candidatas</span>
          <span>Status</span>
          <span>Duração</span>
        </div>
        {recentRuns.map((run) => (
          <article className="admin-table-row" key={run.id}>
            <div className="admin-table-title">
              <b>{run.candidateTitle ?? run.candidateUrl ?? "(sem candidata)"}</b>
              <small>
                {formatDateTime(run.startedAt)} ·{" "}
                {run.triggerType === "cron" ? "Agendada" : run.triggerType === "manual" ? "Manual" : "Dry-run"} ·{" "}
                {reasonLabel(run)}
              </small>
              {run.candidateHistory.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary>Ver {run.candidateHistory.length} candidata(s) rejeitada(s)</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {run.candidateHistory.map((candidate, index) => (
                      <li key={`${run.id}-${index}`}>
                        <small>
                          {candidate.title ?? candidate.url} — {candidateReasonLabel(candidate.reason)}
                        </small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <span className="admin-table-meta">
              {run.candidatesTried}
              {run.candidatesFound > 0 ? `/${run.candidatesFound}` : ""}×
            </span>
            <span className="admin-status" data-status={run.status}>
              {STATUS_LABELS[run.status] ?? run.status}
            </span>
            <span className="admin-table-meta">{formatDuration(run.durationMs)}</span>
          </article>
        ))}
        {recentRuns.length === 0 && (
          <div className="admin-empty">
            <h2>Nenhuma execução registrada</h2>
            <p>
              {telemetryAvailable
                ? "O agente ainda não rodou desde que a telemetria foi ativada."
                : "Aplique a migration supabase-agent-runs-schema.sql para começar a coletar histórico estruturado."}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
