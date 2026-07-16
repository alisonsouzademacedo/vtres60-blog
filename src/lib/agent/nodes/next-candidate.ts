import { operationsRepository } from "@/services/operations";
import type { AgentState, AgentStateUpdate } from "../state";

// Fase 7 (Secao 18/20) — NextCandidate e o UNICO no alcancado depois de
// exatamente 4 pontos de rejeicao possiveis (ver workflow.ts:
// ExactDedupeGate/NewsworthinessGate/SemanticDedupeGate/ImageProcessor,
// as unicas arestas condicionais que apontam para "NextCandidate"), entao
// o motivo da rejeicao e sempre deriva­vel do estado atual sem
// ambiguidade — mesma logica de branches usada em agent-run-outcome.ts,
// mas aqui e por-candidata, nao pelo run inteiro.
function rejectionReasonFrom(state: AgentState): string {
  if (state.dedupeStatus === "exact_duplicate") return "exact_duplicate";
  if (state.newsworthinessReason !== undefined && !state.isNewsworthy) return "not_newsworthy";
  if (state.dedupeStatus === "same_event_no_material_update") return "same_event_no_material_update";
  if (state.imageResult && state.imageResult.status !== "success") return "image_pipeline_failed";
  return "unknown";
}

/**
 * NextCandidate — roda quando ExactDedupeGate, NewsworthinessGate,
 * SemanticDedupeGate ou ImageProcessor rejeitam a candidata atual NUMA
 * execucao iniciada por descoberta automatica (NewsFetcher). Em vez de
 * encerrar o grafo inteiro sem publicacao por causa de UMA pauta ruim,
 * consome a proxima URL de candidateQueue (ja buscada pelo NewsFetcher,
 * GNews retorna ate 10) e reinicia o ciclo a partir do ExactDedupeGate.
 *
 * Reseta todos os campos transitorios ligados a candidata anterior — sem
 * isso, texto/imagem/auditoria de uma pauta descartada vazariam para a
 * proxima. Nao mexe em queueItemId (irrelevante aqui: URL explicita de
 * admin/fila nunca chega a este no, pois nao tem candidateQueue — ver
 * priorityRouter em workflow.ts).
 */
export async function nextCandidateNode(state: AgentState): Promise<AgentStateUpdate> {
  const [next, ...rest] = state.candidateQueue;

  // Registra a candidata que acabou de ser rejeitada ANTES de resetar
  // qualquer campo do state — candidateHistory nunca e resetado (ao
  // contrario dos campos abaixo), entao acumula do inicio ao fim do run.
  const candidateHistory = state.sourceUrl
    ? [...state.candidateHistory, { url: state.sourceUrl, title: state.candidateTitle, reason: rejectionReasonFrom(state) }]
    : state.candidateHistory;

  if (!next) {
    await operationsRepository.log(
      "proxima_candidata",
      "agente",
      "Fila de candidatas esgotada — nenhuma pauta restante para tentar, encerrando execução.",
    );
    return {
      candidateExhausted: true,
      candidateHistory,
      currentStep: "Nenhuma candidata restante — encerrando execução.",
    };
  }

  await operationsRepository.log(
    "proxima_candidata",
    "agente",
    `Candidata anterior descartada — tentando próxima: "${next.title}" (${next.url}).`,
  );

  return {
    sourceUrl: next.url,
    candidateTitle: next.title,
    candidateQueue: rest,
    candidateExhausted: false,
    candidateHistory,
    candidatesTried: state.candidatesTried + 1,
    currentStep: `Tentando próxima candidata: "${next.title}"`,
    sourceText: "",
    dedupeStatus: undefined,
    exactDuplicatePostId: undefined,
    materialUpdateReason: undefined,
    relatedPostId: undefined,
    isNewsworthy: false,
    newsworthinessReason: undefined,
    eventDateOrPeriod: undefined,
    draftText: "",
    finalPost: undefined,
    auditApproved: false,
    auditFeedback: undefined,
    draftAttempts: 0,
    ogImage: undefined,
    ogImageAlt: undefined,
    companyDomain: undefined,
    companyLogoUrl: undefined,
    imageResult: undefined,
  };
}
