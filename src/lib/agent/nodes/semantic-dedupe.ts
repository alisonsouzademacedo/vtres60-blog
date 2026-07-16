import { z } from "zod";
import { llm } from "../llm";
import { invokeWithUsageTelemetry } from "../costs/record-llm-usage";
import { operationsRepository } from "@/services/operations";
import { editorialRepository } from "@/services/editorial";
import { SEMANTIC_DEDUPE_SYSTEM_PROMPT } from "../prompts";
import { jaccardSimilarity } from "../text-guards";
import type { AgentState, AgentStateUpdate } from "../state";
import type { ManagedPost } from "@/types/editorial";

type RecentPostSummary = Pick<ManagedPost, "id" | "title" | "excerpt" | "createdAt" | "sourceUrl" | "sourceName">;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Abaixo deste limiar, um post recente e considerado sem relacao textual
// nenhuma com a candidata — descartado do pre-filtro antes de chegar ao
// LLM. Deliberadamente baixo (bem abaixo do limiar de 0.6 usado para
// excerpt/impact): aqui o objetivo NAO e detectar paráfrase quase-identica,
// e apenas afastar posts claramente sobre outro assunto, deixando a decisao
// fina (mesmo evento? fato novo?) para o LLM.
export const SEMANTIC_DEDUPE_PREFILTER_THRESHOLD = 0.15;

export const SEMANTIC_DEDUPE_STATUSES = [
  "unique",
  "same_event_no_material_update",
  "same_event_material_update",
] as const;
export type SemanticDedupeStatus = (typeof SEMANTIC_DEDUPE_STATUSES)[number];

const SemanticDedupeSchema = z.object({
  dedupeStatus: z.enum(SEMANTIC_DEDUPE_STATUSES),
  materialUpdateReason: z.string().nullable().describe("Fato novo objetivo, se dedupeStatus=same_event_material_update. null caso contrário."),
  relatedPostId: z.string().nullable().describe("ID do post relacionado da lista fornecida, se aplicável. null se não houver relação."),
});

function candidateText(finalPost: { titulo: string; excerpt: string }): string {
  return `${finalPost.titulo} ${finalPost.excerpt}`;
}

function postText(post: Pick<RecentPostSummary, "title" | "excerpt">): string {
  return `${post.title} ${post.excerpt}`;
}

/**
 * Pre-filtro deterministico: restringe os posts recentes (7 dias por
 * created_at) a candidatos com alguma sobreposicao textual real antes de
 * gastar uma chamada de LLM comparando contra todos eles. Reaproveita
 * jaccardSimilarity() (mesma funcao da Fase 2, ja testada) em vez de um
 * algoritmo novo.
 */
export function filterRecentRelevantPosts(
  candidateFinalPost: { titulo: string; excerpt: string },
  allPosts: RecentPostSummary[],
  currentSourceUrl: string | undefined,
  now: number = Date.now(),
): RecentPostSummary[] {
  const cutoff = now - SEVEN_DAYS_MS;
  const text = candidateText(candidateFinalPost);
  return allPosts.filter((post) => {
    if (post.sourceUrl && post.sourceUrl === currentSourceUrl) return false;
    if (new Date(post.createdAt).getTime() < cutoff) return false;
    return jaccardSimilarity(text, postText(post)) >= SEMANTIC_DEDUPE_PREFILTER_THRESHOLD;
  });
}

function buildUserMessage(
  finalPost: { titulo: string; conteudo: string; excerpt: string },
  sourceName: string | undefined,
  relevantPosts: RecentPostSummary[],
): string {
  const candidateBlock =
    `CANDIDATA:\nTítulo: ${finalPost.titulo}\nResumo: ${finalPost.excerpt}\nFonte: ${sourceName ?? "desconhecida"}\n` +
    `Trecho do corpo: ${finalPost.conteudo.slice(0, 800)}`;
  const relatedBlock = relevantPosts
    .map(
      (post) =>
        `- id: ${post.id}\n  título: ${post.title}\n  resumo: ${post.excerpt}\n  fonte: ${post.sourceName || "desconhecida"}\n  publicado em: ${post.createdAt}`,
    )
    .join("\n\n");
  return `${candidateBlock}\n\nPOSTS RECENTES (últimos 7 dias) POTENCIALMENTE RELACIONADOS:\n${relatedBlock}`;
}

/**
 * SemanticDedupeGate — roda apos o InternalAuditor aprovar (ou esgotar
 * tentativas), ANTES do ImageProcessor. Posicao escolhida porque compara
 * titulo/excerpt/corpo do DRAFT JA POLIDO (mais preciso e estruturado que o
 * sourceText bruto) contra os mesmos campos dos posts existentes.
 *
 * Janela de 7 dias por created_at (nao published_at) — mesmo criterio
 * cronologico adotado e testado nas Fases 1/2.
 */
export async function semanticDedupeNode(state: AgentState): Promise<AgentStateUpdate> {
  if (!state.finalPost) {
    throw new Error("SemanticDedupeGate: finalPost ausente no state.");
  }
  // Capturado em const: o narrowing de `state.finalPost` acima nao
  // atravessa a closure passada a invokeWithUsageTelemetry abaixo (TS nao
  // consegue provar que a propriedade nao mudou ate a closure rodar).
  const finalPost = state.finalPost;

  const allPosts = await editorialRepository.listPosts();
  const relevant = filterRecentRelevantPosts(finalPost, allPosts, state.sourceUrl);

  if (relevant.length === 0) {
    return {
      dedupeStatus: "unique",
      materialUpdateReason: undefined,
      relatedPostId: undefined,
      currentStep: "Nenhum evento recente semelhante encontrado — pauta única.",
    };
  }

  const judge = llm.withStructuredOutput(SemanticDedupeSchema, { includeRaw: true });
  const result = await invokeWithUsageTelemetry({ runId: state.runId, operation: "semantic_dedupe", modelRequested: "gpt-4o" }, () =>
    judge.invoke([
      { role: "system", content: SEMANTIC_DEDUPE_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(finalPost, undefined, relevant) },
    ]),
  );

  const relevantIds = new Set(relevant.map((post) => post.id));
  const relatedPostId = result.relatedPostId && relevantIds.has(result.relatedPostId) ? result.relatedPostId : undefined;

  // Status fora do enum permitido nunca deveria acontecer (structured
  // output ja valida via zod), mas se a validacao de zod falhar de forma
  // inesperada, o catch do node (workflow) propagaria a excecao — aqui so
  // documentamos a garantia: SemanticDedupeSchema.dedupeStatus e um
  // z.enum(), entao `result.dedupeStatus` so pode ser um dos 3 valores.
  const dedupeStatus: SemanticDedupeStatus = result.dedupeStatus;

  await operationsRepository.log(
    "dedupe_semantico",
    "agente",
    `dedupeStatus=${dedupeStatus} | materialUpdateReason=${result.materialUpdateReason ?? "null"} | relatedPostId=${relatedPostId ?? "null"} | candidatos comparados=${relevant.length}`,
  );

  return {
    dedupeStatus,
    materialUpdateReason: dedupeStatus === "same_event_material_update" ? (result.materialUpdateReason ?? undefined) : undefined,
    relatedPostId,
    currentStep:
      dedupeStatus === "same_event_no_material_update"
        ? "Pauta descartada — mesmo evento já coberto, sem fato novo (same_event_no_material_update)."
        : dedupeStatus === "same_event_material_update"
          ? "Mesmo evento com fato novo confirmado — prosseguindo (same_event_material_update)."
          : "Pauta única em relação aos posts recentes — prosseguindo.",
  };
}
