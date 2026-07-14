import { supabaseAdmin } from "@/lib/supabase";
import type { CostStatus } from "./calculate-cost";

export type UsageProvider = "openai" | "gnews" | "replicate" | "pexels" | "supabase";
export type UsageOperation =
  | "news_search"
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
  requestId?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  usage?: Record<string, unknown>;
  currency?: string;
  unitCost?: number;
  estimatedCost?: number;
  costStatus: CostStatus;
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
    request_id: input.requestId ?? null,
    started_at: input.startedAt,
    finished_at: input.finishedAt ?? null,
    duration_ms: input.durationMs ?? null,
    usage: input.usage ?? null,
    currency: input.currency ?? null,
    unit_cost: input.unitCost ?? null,
    estimated_cost: input.estimatedCost ?? null,
    cost_status: input.costStatus,
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
  estimatedCost: number | undefined;
  costStatus: CostStatus;
  publishedPostId: string | undefined;
  createdAt: string;
}

function fromRow(row: {
  id: string;
  run_id: string | null;
  provider: UsageProvider;
  operation: UsageOperation;
  model: string | null;
  estimated_cost: number | null;
  cost_status: CostStatus;
  published_post_id: string | null;
  created_at: string;
}): UsageRow {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    provider: row.provider,
    operation: row.operation,
    model: row.model ?? undefined,
    estimatedCost: row.estimated_cost ?? undefined,
    costStatus: row.cost_status,
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
