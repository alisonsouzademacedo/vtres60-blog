import { END, START, StateGraph } from "@langchain/langgraph";
import { contentExtractorNode } from "./nodes/content-extractor";
import { MAX_DRAFT_ATTEMPTS, drafterNode } from "./nodes/drafter";
import { exactDedupeNode } from "./nodes/exact-dedupe";
import { imageProcessorNode } from "./nodes/image-processor";
import { internalAuditorNode } from "./nodes/internal-auditor";
import { newsFetcherNode } from "./nodes/news-fetcher";
import { newsworthinessNode } from "./nodes/newsworthiness";
import { nextCandidateNode } from "./nodes/next-candidate";
import { publisherNode } from "./nodes/publisher";
import { semanticDedupeNode } from "./nodes/semantic-dedupe";
import { AgentStateAnnotation, type AgentState } from "./state";

/**
 * PriorityRouter: decide o ponto de entrada do grafo.
 *
 * A spec original descreve isso como um "no", mas como e uma decisao pura
 * de roteamento (nao le nem escreve nada no state), a forma idiomatica no
 * LangGraph e uma conditional edge a partir de START, nao um no dedicado
 * que so repassaria o state adiante sem altera-lo.
 */
function priorityRouter(state: AgentState): "ExactDedupeGate" | "NewsFetcher" {
  return state.sourceUrl ? "ExactDedupeGate" : "NewsFetcher";
}

/**
 * Roteamento pos-busca: se o NewsFetcher encontrou e escolheu uma noticia,
 * `sourceUrl` foi preenchido e segue para o ExactDedupeGate. Se a GNews
 * falhou ou nao retornou nenhum artigo (ver news-fetcher.ts), `sourceUrl`
 * continua vazio — encerra o grafo em END de forma graciosa, sem lancar
 * excecao nem seguir adiante com um gate que nao teria o que checar.
 */
function routeAfterNewsFetch(state: AgentState): "ExactDedupeGate" | typeof END {
  return state.sourceUrl ? "ExactDedupeGate" : END;
}

/**
 * Fase 3 — roteamento pos-dedupe-exato: URL unica segue para extracao de
 * conteudo; duplicidade exata (mesma URL normalizada ja em public.posts ou
 * em agent_queue) NAO encerra mais o grafo direto — Fase 6: segue para
 * NextCandidate, que tenta a proxima pauta da candidateQueue antes de
 * desistir da execucao. Ver nodes/exact-dedupe.ts e nodes/next-candidate.ts.
 */
function routeAfterExactDedupe(state: AgentState): "ContentExtractor" | "NextCandidate" {
  return state.dedupeStatus === "exact_duplicate" ? "NextCandidate" : "ContentExtractor";
}

/**
 * Fase 3 — roteamento pos-noticiabilidade: pauta noticiavel segue para
 * redacao; pauta nao-noticiavel (conteudo evergreen/generico, sem evento
 * ou dado datavel) NAO encerra mais o grafo direto — Fase 6: segue para
 * NextCandidate antes do ciclo caro de Drafter/InternalAuditor/
 * ImageProcessor. Ver nodes/newsworthiness.ts e nodes/next-candidate.ts.
 */
function routeAfterNewsworthiness(state: AgentState): "Drafter" | "NextCandidate" {
  return state.isNewsworthy ? "Drafter" : "NextCandidate";
}

/**
 * Fase 6 — roteamento pos-NextCandidate: fila esgotada (candidateExhausted)
 * encerra o grafo de fato; havendo proxima candidata, reinicia o ciclo a
 * partir do ExactDedupeGate com o novo sourceUrl. Ver nodes/next-candidate.ts.
 */
function routeAfterNextCandidate(state: AgentState): "ExactDedupeGate" | typeof END {
  return state.candidateExhausted ? END : "ExactDedupeGate";
}

/**
 * Roteamento pos-auditoria: aprovado segue para o SemanticDedupeGate;
 * reprovado volta para o Drafter com o feedback ate MAX_DRAFT_ATTEMPTS
 * tentativas. Esgotadas as tentativas, TAMBEM segue para o
 * SemanticDedupeGate/ImageProcessor/Publisher — mas o Publisher, ao ver
 * `auditApproved: false`, salva como "draft" para revisao humana de
 * emergencia em vez de descartar o trabalho ou publicar algo que nao
 * passou na auditoria (ver publisher.ts). Excecao: categoryId invalido faz
 * o Publisher nao criar post nenhum (classification_failed).
 */
function routeAfterAudit(state: AgentState): "Drafter" | "SemanticDedupeGate" {
  if (state.auditApproved) return "SemanticDedupeGate";
  if (state.draftAttempts >= MAX_DRAFT_ATTEMPTS) return "SemanticDedupeGate";
  return "Drafter";
}

/**
 * Fase 3 — roteamento pos-dedupe-semantico: mesmo evento sem fato novo NAO
 * encerra mais o grafo direto — Fase 6: segue para NextCandidate (nao gasta
 * ImageProcessor/Publisher numa materia que nao deve ser publicada, mas
 * tenta outra pauta antes de desistir); pauta unica ou com fato novo
 * confirmado segue para a imagem. Ver nodes/semantic-dedupe.ts.
 */
function routeAfterSemanticDedupe(state: AgentState): "ImageProcessor" | "NextCandidate" {
  return state.dedupeStatus === "same_event_no_material_update" ? "NextCandidate" : "ImageProcessor";
}

/**
 * Fase 4 — roteamento pos-imagem: nenhum tier da cascata (source_og ->
 * generated_replicate -> pexels) aprovou uma imagem => image_pipeline_failed.
 * NAO encerra mais o grafo direto — Fase 6: segue para NextCandidate. Nao ha
 * placeholder publicavel — uma noticia sem imagem aprovada simplesmente nao
 * e publicada, mas a execucao tenta outra pauta antes de desistir. Ver
 * nodes/image-processor.ts.
 */
function routeAfterImageProcessing(state: AgentState): "Publisher" | "NextCandidate" {
  return state.imageResult?.status === "success" ? "Publisher" : "NextCandidate";
}

const graph = new StateGraph(AgentStateAnnotation)
  .addNode("NewsFetcher", newsFetcherNode)
  .addNode("ExactDedupeGate", exactDedupeNode)
  .addNode("ContentExtractor", contentExtractorNode)
  .addNode("NewsworthinessGate", newsworthinessNode)
  .addNode("Drafter", drafterNode)
  .addNode("InternalAuditor", internalAuditorNode)
  .addNode("SemanticDedupeGate", semanticDedupeNode)
  .addNode("ImageProcessor", imageProcessorNode)
  .addNode("Publisher", publisherNode)
  .addNode("NextCandidate", nextCandidateNode)
  .addConditionalEdges(START, priorityRouter, {
    ExactDedupeGate: "ExactDedupeGate",
    NewsFetcher: "NewsFetcher",
  })
  .addConditionalEdges("NewsFetcher", routeAfterNewsFetch, {
    ExactDedupeGate: "ExactDedupeGate",
    [END]: END,
  })
  .addConditionalEdges("ExactDedupeGate", routeAfterExactDedupe, {
    ContentExtractor: "ContentExtractor",
    NextCandidate: "NextCandidate",
  })
  .addEdge("ContentExtractor", "NewsworthinessGate")
  .addConditionalEdges("NewsworthinessGate", routeAfterNewsworthiness, {
    Drafter: "Drafter",
    NextCandidate: "NextCandidate",
  })
  .addEdge("Drafter", "InternalAuditor")
  .addConditionalEdges("InternalAuditor", routeAfterAudit, {
    Drafter: "Drafter",
    SemanticDedupeGate: "SemanticDedupeGate",
  })
  .addConditionalEdges("SemanticDedupeGate", routeAfterSemanticDedupe, {
    ImageProcessor: "ImageProcessor",
    NextCandidate: "NextCandidate",
  })
  .addConditionalEdges("ImageProcessor", routeAfterImageProcessing, {
    Publisher: "Publisher",
    NextCandidate: "NextCandidate",
  })
  .addConditionalEdges("NextCandidate", routeAfterNextCandidate, {
    ExactDedupeGate: "ExactDedupeGate",
    [END]: END,
  })
  .addEdge("Publisher", END);

export const agentGraph = graph.compile();
export type { AgentState } from "./state";
