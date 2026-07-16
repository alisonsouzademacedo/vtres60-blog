import { supabaseAdmin } from "@/lib/supabase";
import type { CostStatus } from "./calculate-cost";

export type UsageProvider = "openai" | "gnews" | "replicate" | "pexels" | "supabase";
export type UsageOperation =
  // news_search: chamada HTTP real ao GNews (provider "gnews"), sem LLM.
  | "news_search"
  // news_pick: chamada LLM (provider "openai") que escolhe a candidata
  // mais aderente entre os resultados do GNews — operacao distinta de
  // news_search porque e outro provider e outro tipo de custo.
  | "news_pick"
  | "draft_generation"
  | "internal_audit"
  | "semantic_dedupe"
  | "newsworthiness"
  | "image_generation"
  | "pexels_search"
  | "storage_upload";

export interface RecordUsageInput {
  runId?: string;
  provider: UsageProvider;
  operation: UsageOperation;
  model?: string;
  modelReturned?: string;
  requestId?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  usage?: Record<string, unknown>;
  currency?: string;
  unitCost?: number;
  estimatedCost?: number;
  costStatus: CostStatus;
  finishReason?: string;
  retryCount?: number;
  attemptNumber?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  publishedPostId?: string;
}

/**
 * Grava UMA chamada de provider. Best-effort por design (ver comentario em
 * cron/route.ts sobre agent_runs) — chamadores devem envolver com
 * `.catch(() => undefined)` ate a migration ser aplicada em producao.
 */
export async function recordProviderUsage(input: RecordUsageInput): Promise<void> {
  const { error } = await supabaseAdmin.from("agent_provider_usage").insert({
    run_id: input.runId ?? null,
    provider: input.provider,
    operation: input.operation,
    model: input.model ?? null,
    model_returned: input.modelReturned ?? null,
    request_id: input.requestId ?? null,
    started_at: input.startedAt,
    finished_at: input.finishedAt ?? null,
    duration_ms: input.durationMs ?? null,
    usage: input.usage ?? null,
    currency: input.currency ?? null,
    unit_cost: input.unitCost ?? null,
    estimated_cost: input.estimatedCost ?? null,
    cost_status: input.costStatus,
    finish_reason: input.finishReason ?? null,
    retry_count: input.retryCount ?? null,
    attempt_number: input.attemptNumber ?? null,
    success: input.success ?? true,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    published_post_id: input.publishedPostId ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface UsageRow {
  id: string;
  runId: string | undefined;
  provider: UsageProvider;
  operation: UsageOperation;
  model: string | undefined;
  modelReturned?: string | undefined;
  estimatedCost: number | undefined;
  costStatus: CostStatus;
  durationMs?: number | undefined;
  finishReason?: string | undefined;
  attemptNumber?: number | undefined;
  success: boolean;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  publishedPostId: string | undefined;
  createdAt: string;
}

function fromRow(row: {
  id: string;
  run_id: string | null;
  provider: UsageProvider;
  operation: UsageOperation;
  model: string | null;
  model_returned: string | null;
  estimated_cost: number | null;
  cost_status: CostStatus;
  duration_ms: number | null;
  finish_reason: string | null;
  attempt_number: number | null;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  published_post_id: string | null;
  created_at: string;
}): UsageRow {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    provider: row.provider,
    operation: row.operation,
    model: row.model ?? undefined,
    modelReturned: row.model_returned ?? undefined,
    estimatedCost: row.estimated_cost ?? undefined,
    costStatus: row.cost_status,
    durationMs: row.duration_ms ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    attemptNumber: row.attempt_number ?? undefined,
    success: row.success,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    publishedPostId: row.published_post_id ?? undefined,
    createdAt: row.created_at,
  };
}

/** Uso registrado desde `sinceIso` (ex: janela de 7/30 dias) — para agregação no painel de custos. */
export async function listUsageSince(sinceIso: string): Promise<UsageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_provider_usage")
    .select("*")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}
