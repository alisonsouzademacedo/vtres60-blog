import { supabaseAdmin } from "@/lib/supabase";
import type { AgentRunOutcome, AgentRunStatus, AgentRunTerminalReason } from "./agent-run-outcome";

export type AgentRunTriggerType = "cron" | "manual" | "dry_run";

export interface AgentRun {
  id: string;
  triggerType: AgentRunTriggerType;
  scheduledFor?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  status: AgentRunStatus;
  terminalReason?: AgentRunTerminalReason;
  candidateTitle?: string;
  candidateUrl?: string;
  candidatesTried: number;
  sourceName?: string;
  exactDedupeStatus?: string;
  newsworthinessStatus?: string;
  draftAttempts?: number;
  auditStatus?: string;
  semanticDedupeStatus?: string;
  materialUpdateReason?: string;
  imageTier?: string;
  imageStatus?: string;
  publishedPostId?: string;
  providerErrors?: Record<string, string>;
  createdAt: string;
}

interface AgentRunRow {
  id: string;
  trigger_type: AgentRunTriggerType;
  scheduled_for: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: AgentRunStatus;
  terminal_reason: AgentRunTerminalReason | null;
  candidate_title: string | null;
  candidate_url: string | null;
  candidates_tried: number;
  source_name: string | null;
  exact_dedupe_status: string | null;
  newsworthiness_status: string | null;
  draft_attempts: number | null;
  audit_status: string | null;
  semantic_dedupe_status: string | null;
  material_update_reason: string | null;
  image_tier: string | null;
  image_status: string | null;
  published_post_id: string | null;
  provider_errors: Record<string, string> | null;
  created_at: string;
}

function fromRow(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    triggerType: row.trigger_type,
    scheduledFor: row.scheduled_for ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    status: row.status,
    terminalReason: row.terminal_reason ?? undefined,
    candidateTitle: row.candidate_title ?? undefined,
    candidateUrl: row.candidate_url ?? undefined,
    candidatesTried: row.candidates_tried,
    sourceName: row.source_name ?? undefined,
    exactDedupeStatus: row.exact_dedupe_status ?? undefined,
    newsworthinessStatus: row.newsworthiness_status ?? undefined,
    draftAttempts: row.draft_attempts ?? undefined,
    auditStatus: row.audit_status ?? undefined,
    semanticDedupeStatus: row.semantic_dedupe_status ?? undefined,
    materialUpdateReason: row.material_update_reason ?? undefined,
    imageTier: row.image_tier ?? undefined,
    imageStatus: row.image_status ?? undefined,
    publishedPostId: row.published_post_id ?? undefined,
    providerErrors: row.provider_errors ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createRun(input: { triggerType: AgentRunTriggerType; scheduledFor?: string }): Promise<AgentRun> {
  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .insert({
      trigger_type: input.triggerType,
      scheduled_for: input.scheduledFor ?? null,
      status: "running",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as AgentRunRow);
}

export interface FinishRunInput extends AgentRunOutcome {
  durationMs: number;
  sourceName?: string;
  draftAttempts?: number;
  materialUpdateReason?: string;
  providerErrors?: Record<string, string>;
}

/**
 * Persiste o resultado terminal de uma execucao (ver
 * agent-run-outcome.ts:deriveRunOutcome para como esses campos sao
 * calculados a partir do AgentState). Sempre roda no finally do
 * caller — mesmo runs que lancam excecao chegam aqui com
 * status:"failed" ja calculado, nunca ficam presas em "running".
 */
export async function finishRun(runId: string, patch: FinishRunInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_runs")
    .update({
      status: patch.status,
      terminal_reason: patch.terminalReason,
      finished_at: new Date().toISOString(),
      duration_ms: patch.durationMs,
      candidate_title: patch.candidateTitle ?? null,
      candidate_url: patch.candidateUrl ?? null,
      candidates_tried: patch.candidatesTried,
      source_name: patch.sourceName ?? null,
      exact_dedupe_status: patch.exactDedupeStatus ?? null,
      newsworthiness_status: patch.newsworthinessStatus ?? null,
      draft_attempts: patch.draftAttempts ?? null,
      audit_status: patch.auditStatus ?? null,
      semantic_dedupe_status: patch.semanticDedupeStatus ?? null,
      material_update_reason: patch.materialUpdateReason ?? null,
      image_tier: patch.imageTier ?? null,
      image_status: patch.imageStatus ?? null,
      published_post_id: patch.publishedPostId ?? null,
      provider_errors: patch.providerErrors ?? null,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function listRecentRuns(limit = 20): Promise<AgentRun[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => fromRow(row as AgentRunRow));
}

export async function getLastRun(): Promise<AgentRun | undefined> {
  const runs = await listRecentRuns(1);
  return runs[0];
}

export async function getLastPublishedRun(): Promise<AgentRun | undefined> {
  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as AgentRunRow) : undefined;
}
