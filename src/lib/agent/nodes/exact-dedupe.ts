import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";
import type { AgentState, AgentStateUpdate } from "../state";
import { claimUrl, listQueueEntries } from "../queue-repository";
import { normalizeSourceUrl } from "../text-guards";

/**
 * ExactDedupeGate — roda logo apos ter uma sourceUrl candidata (vinda do
 * NewsFetcher OU de uma execucao manual/admin com URL ja definida), ANTES
 * do ContentExtractor. Posicao deliberada: e a checagem mais barata do
 * pipeline (sem fetch de rede, sem LLM), entao roda primeiro para evitar
 * gastar o scraping com uma URL que ja e duplicidade exata.
 *
 * Verifica duas fontes, cada uma com uma responsabilidade diferente:
 * - public.posts.source_url (via editorialRepository.listPosts()) —
 *   verdade sobre conteudo editorial ja persistido (draft OU published).
 * - agent_queue (via listQueueEntries()) — registro de URLs ja
 *   reivindicadas por uma execucao do agente, publicada ou nao (inclui
 *   URLs submetidas manualmente via admin E URLs "claimed" por execucoes
 *   anteriores deste proprio gate).
 *
 * Ambas as URLs sao comparadas apos normalizeSourceUrl() (nao string exata),
 * porque a mesma materia pode aparecer com UTMs diferentes.
 */
export async function exactDedupeNode(state: AgentState): Promise<AgentStateUpdate> {
  if (!state.sourceUrl) {
    throw new Error("ExactDedupeGate: sourceUrl ausente no state.");
  }

  const normalized = normalizeSourceUrl(state.sourceUrl);

  const posts = await editorialRepository.listPosts();
  const matchedPost = posts.find((post) => post.sourceUrl && normalizeSourceUrl(post.sourceUrl) === normalized);
  if (matchedPost) {
    await operationsRepository.log(
      "dedupe_exato",
      "agente",
      `exact_duplicate: ${state.sourceUrl} (normalizada: ${normalized}) já existe no post ${matchedPost.id} (status: ${matchedPost.status}).`,
    );
    return {
      dedupeStatus: "exact_duplicate",
      exactDuplicatePostId: matchedPost.id,
      currentStep: "Pauta descartada — já existe post com esta fonte (exact_duplicate).",
    };
  }

  const queueEntries = await listQueueEntries();
  const matchedQueue = queueEntries.find(
    (entry) => entry.id !== state.queueItemId && normalizeSourceUrl(entry.url) === normalized,
  );
  if (matchedQueue) {
    await operationsRepository.log(
      "dedupe_exato",
      "agente",
      `exact_duplicate: ${state.sourceUrl} (normalizada: ${normalized}) já está em agent_queue (id: ${matchedQueue.id}, status: ${matchedQueue.status}).`,
    );
    return {
      dedupeStatus: "exact_duplicate",
      currentStep: "Pauta descartada — URL já processada/em processamento (exact_duplicate).",
    };
  }

  await claimUrl(state.sourceUrl);
  return {
    dedupeStatus: "unique",
    currentStep: "Nenhuma duplicidade exata encontrada — extraindo conteúdo...",
  };
}
