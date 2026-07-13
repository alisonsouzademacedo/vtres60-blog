import { END, START, StateGraph } from "@langchain/langgraph";
import { contentExtractorNode } from "./nodes/content-extractor";
import { MAX_DRAFT_ATTEMPTS, drafterNode } from "./nodes/drafter";
import { exactDedupeNode } from "./nodes/exact-dedupe";
import { imageProcessorNode } from "./nodes/image-processor";
import { internalAuditorNode } from "./nodes/internal-auditor";
import { newsFetcherNode } from "./nodes/news-fetcher";
import { newsworthinessNode } from "./nodes/newsworthiness";
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
 * em agent_queue) encerra o grafo SEM gastar ContentExtractor/Drafter/
 * ImageProcessor. Ver nodes/exact-dedupe.ts.
 */
function routeAfterExactDedupe(state: AgentState): "ContentExtractor" | typeof END {
  return state.dedupeStatus === "exact_duplicate" ? END : "ContentExtractor";
}

/**
 * Fase 3 — roteamento pos-noticiabilidade: pauta noticiavel segue para
 * redacao; pauta nao-noticiavel (conteudo evergreen/generico, sem evento
 * ou dado datavel) encerra o grafo ANTES do ciclo caro de
 * Drafter/InternalAuditor/ImageProcessor. Ver nodes/newsworthiness.ts.
 */
function routeAfterNewsworthiness(state: AgentState): "Drafter" | typeof END {
  return state.isNewsworthy ? "Drafter" : END;
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
 * Fase 3 — roteamento pos-dedupe-semantico: mesmo evento sem fato novo
 * encerra o grafo (nao gasta ImageProcessor/Publisher numa materia que nao
 * deve ser publicada); pauta unica ou com fato novo confirmado segue para
 * a imagem. Ver nodes/semantic-dedupe.ts.
 */
function routeAfterSemanticDedupe(state: AgentState): "ImageProcessor" | typeof END {
  return state.dedupeStatus === "same_event_no_material_update" ? END : "ImageProcessor";
}

/**
 * Fase 4 — roteamento pos-imagem: nenhum tier da cascata (source_og ->
 * generated_replicate -> pexels) aprovou uma imagem => image_pipeline_failed,
 * encerra o grafo SEM passar pelo Publisher. Nao ha mais placeholder
 * publicavel — uma noticia sem imagem aprovada simplesmente nao e
 * publicada. Ver nodes/image-processor.ts.
 */
function routeAfterImageProcessing(state: AgentState): "Publisher" | typeof END {
  return state.imageResult?.status === "success" ? "Publisher" : END;
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
    [END]: END,
  })
  .addEdge("ContentExtractor", "NewsworthinessGate")
  .addConditionalEdges("NewsworthinessGate", routeAfterNewsworthiness, {
    Drafter: "Drafter",
    [END]: END,
  })
  .addEdge("Drafter", "InternalAuditor")
  .addConditionalEdges("InternalAuditor", routeAfterAudit, {
    Drafter: "Drafter",
    SemanticDedupeGate: "SemanticDedupeGate",
  })
  .addConditionalEdges("SemanticDedupeGate", routeAfterSemanticDedupe, {
    ImageProcessor: "ImageProcessor",
    [END]: END,
  })
  .addConditionalEdges("ImageProcessor", routeAfterImageProcessing, {
    Publisher: "Publisher",
    [END]: END,
  })
  .addEdge("Publisher", END);

export const agentGraph = graph.compile();
export type { AgentState } from "./state";
