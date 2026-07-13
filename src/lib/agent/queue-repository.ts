import { supabaseAdmin } from "@/lib/supabase";

export type AgentQueueStatus = "pending" | "processed";

export interface AgentQueueItem {
  id: string;
  url: string;
  status: AgentQueueStatus;
  createdAt: string;
}

function fromRow(row: { id: string; url: string; status: AgentQueueStatus; created_at: string }): AgentQueueItem {
  return { id: row.id, url: row.url, status: row.status, createdAt: row.created_at };
}

export async function enqueueUrl(url: string): Promise<AgentQueueItem> {
  const { data, error } = await supabaseAdmin
    .from("agent_queue")
    .insert({ url, status: "pending" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

export async function getOldestPendingUrl(): Promise<AgentQueueItem | undefined> {
  const { data, error } = await supabaseAdmin
    .from("agent_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : undefined;
}

export async function markProcessed(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("agent_queue").update({ status: "processed" }).eq("id", id);
  if (error) throw new Error(error.message);
}

// Fase 3 — usadas pelo ExactDedupeGate (nodes/exact-dedupe.ts).
//
// listQueueEntries: le TODA a fila (qualquer status) para o ExactDedupeGate
// comparar URLs normalizadas contra ela. limit(500) e uma salvaguarda de
// leitura, nao um limite de negocio — a fila hoje tem poucas dezenas de
// linhas na pior hipotese.
export async function listQueueEntries(): Promise<AgentQueueItem[]> {
  const { data, error } = await supabaseAdmin
    .from("agent_queue")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

// claimUrl: registra a URL como "processed" IMEDIATAMENTE (nao "pending")
// — status "pending" e reservado para URLs submetidas manualmente via
// admin (enqueueUrl), que o cron ainda vai consumir num proximo disparo
// (getOldestPendingUrl). Se uma URL descoberta pelo NewsFetcher fosse
// inserida aqui como "pending", o PROXIMO disparo do cron a trataria como
// um item de fila legitimo a processar de novo — bug de reprocessamento.
// "processed" deixa o registro visivel para deduplicacao (listQueueEntries)
// sem nunca ser pego por getOldestPendingUrl().
//
// Isso e um "claim" best-effort, NAO atomico: nao ha constraint UNIQUE em
// agent_queue.url no schema atual (supabase-queue-schema.sql), entao duas
// execucoes quase simultaneas ainda podem, em teoria, passar pela checagem
// de duplicidade antes de qualquer uma delas chamar claimUrl(). Ver
// relatorio da Fase 3, secao "concorrencia", para a analise honesta desse
// limite.
export async function claimUrl(url: string): Promise<AgentQueueItem> {
  const { data, error } = await supabaseAdmin.from("agent_queue").insert({ url, status: "processed" }).select().single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}
