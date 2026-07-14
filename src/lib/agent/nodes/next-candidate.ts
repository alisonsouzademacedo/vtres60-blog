import { operationsRepository } from "@/services/operations";
import type { AgentState, AgentStateUpdate } from "../state";

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

  if (!next) {
    await operationsRepository.log(
      "proxima_candidata",
      "agente",
      "Fila de candidatas esgotada — nenhuma pauta restante para tentar, encerrando execução.",
    );
    return {
      candidateExhausted: true,
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
