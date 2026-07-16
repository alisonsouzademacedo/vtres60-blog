import { normalizeError } from "./costs/record-llm-usage";
import type { AgentState } from "./state";

export type AgentRunStatus = "running" | "published" | "draft" | "rejected" | "failed";

export type AgentRunTerminalReason =
  | "published"
  | "draft_pending_review"
  | "auditor_rejected_saved_as_draft"
  | "exact_duplicate"
  | "not_newsworthy"
  | "same_event_no_material_update"
  | "classification_failed"
  | "image_pipeline_failed"
  | "no_candidate"
  | "candidates_exhausted"
  | "provider_unavailable"
  | "operational_error";

export interface AgentRunOutcome {
  status: AgentRunStatus;
  terminalReason: AgentRunTerminalReason;
  exactDedupeStatus?: "unique" | "exact_duplicate";
  newsworthinessStatus?: "newsworthy" | "not_newsworthy";
  auditStatus?: "approved" | "rejected";
  semanticDedupeStatus?: "same_event_no_material_update" | "same_event_material_update";
  imageTier?: string;
  imageStatus?: string;
  candidatesTried: number;
  candidatesFound: number;
  candidateHistory: { url: string; title: string | undefined; reason: string }[];
  candidateUrl?: string;
  candidateTitle?: string;
  publishedPostId?: string;
  errorCode?: string;
  errorSummary?: string;
}

function semanticDedupeStatusFrom(state: AgentState): AgentRunOutcome["semanticDedupeStatus"] {
  return state.dedupeStatus === "same_event_no_material_update" || state.dedupeStatus === "same_event_material_update"
    ? state.dedupeStatus
    : undefined;
}

function exactDedupeStatusFrom(state: AgentState): AgentRunOutcome["exactDedupeStatus"] {
  if (state.dedupeStatus === "exact_duplicate") return "exact_duplicate";
  const reachedLaterStage =
    state.newsworthinessReason !== undefined ||
    state.finalPost !== undefined ||
    state.imageResult !== undefined ||
    semanticDedupeStatusFrom(state) !== undefined;
  if (reachedLaterStage || state.dedupeStatus === "unique") return "unique";
  return undefined;
}

function newsworthinessStatusFrom(state: AgentState): AgentRunOutcome["newsworthinessStatus"] {
  if (state.newsworthinessReason === undefined) return undefined;
  return state.isNewsworthy ? "newsworthy" : "not_newsworthy";
}

function auditStatusFrom(state: AgentState): AgentRunOutcome["auditStatus"] {
  if (!state.finalPost) return undefined;
  return state.auditApproved ? "approved" : "rejected";
}

function imageTierFrom(state: AgentState): string | undefined {
  return state.imageResult?.status === "success" ? state.imageResult.origin : undefined;
}

function imageStatusFrom(state: AgentState): string | undefined {
  if (!state.imageResult) return undefined;
  return state.imageResult.status === "success" ? "success" : state.imageResult.reason;
}

// Compartilhado pelas rotas /api/agent/cron e /api/agent/trigger para
// preencher agent_runs.source_name a partir do sourceUrl final.
export function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Traduz o AgentState final (ou um erro lancado durante agentGraph.invoke)
 * no resultado terminal a persistir em agent_runs. Pura e sem I/O — cada
 * ramo corresponde a exatamente um ponto de saida do grafo (workflow.ts),
 * entao os ifs sao mutuamente exclusivos por construcao (o grafo so pode
 * ter terminado por UM desses motivos).
 *
 * Ordem importa: checagens mais especificas (erro, publicado, dedupe
 * exato) vem antes das mais genericas (newsworthiness, no_candidate) para
 * nao confundir o valor DEFAULT de um campo (ex: isNewsworthy=false antes
 * do gate rodar) com uma rejeicao real desse gate.
 */
export function deriveRunOutcome(state: AgentState, error: unknown): AgentRunOutcome {
  const shared = {
    exactDedupeStatus: exactDedupeStatusFrom(state),
    newsworthinessStatus: newsworthinessStatusFrom(state),
    auditStatus: auditStatusFrom(state),
    semanticDedupeStatus: semanticDedupeStatusFrom(state),
    imageTier: imageTierFrom(state),
    imageStatus: imageStatusFrom(state),
    candidatesTried: state.candidatesTried,
    candidatesFound: state.candidatesFound,
    candidateHistory: state.candidateHistory,
    candidateUrl: state.sourceUrl,
    candidateTitle: state.candidateTitle,
    publishedPostId: state.publishedPostId,
  };

  if (error !== undefined) {
    const normalized = normalizeError(error);
    return { ...shared, status: "failed", terminalReason: "operational_error", errorCode: normalized.code, errorSummary: normalized.message };
  }

  if (state.publishedPostId) {
    if (state.autoPublish && state.auditApproved) {
      return { ...shared, status: "published", terminalReason: "published" };
    }
    if (!state.auditApproved) {
      return { ...shared, status: "draft", terminalReason: "auditor_rejected_saved_as_draft" };
    }
    return { ...shared, status: "draft", terminalReason: "draft_pending_review" };
  }

  if (!state.sourceUrl) {
    return { ...shared, status: "rejected", terminalReason: "no_candidate" };
  }

  if (state.finalPost && state.imageResult?.status === "success") {
    return { ...shared, status: "rejected", terminalReason: "classification_failed" };
  }

  if (state.imageResult && state.imageResult.status !== "success") {
    return { ...shared, status: "rejected", terminalReason: "image_pipeline_failed" };
  }

  if (state.dedupeStatus === "same_event_no_material_update") {
    return { ...shared, status: "rejected", terminalReason: "same_event_no_material_update" };
  }

  if (state.dedupeStatus === "exact_duplicate") {
    return { ...shared, status: "rejected", terminalReason: "exact_duplicate" };
  }

  if (state.newsworthinessReason !== undefined && !state.isNewsworthy) {
    return { ...shared, status: "rejected", terminalReason: "not_newsworthy" };
  }

  // Nenhum dos ramos conhecidos do grafo se aplica — nao deveria acontecer
  // (workflow.ts e exaustivo), mas nunca lanca excecao por observabilidade:
  // fica visivel no painel como falha operacional para investigacao,
  // em vez de quebrar silenciosamente.
  return { ...shared, status: "failed", terminalReason: "operational_error" };
}
