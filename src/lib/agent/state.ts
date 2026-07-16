import { Annotation } from "@langchain/langgraph";
import type { ImageProcessingResult } from "./image-pipeline/types";

/**
 * Estado compartilhado do grafo do Agente Autonomo.
 *
 * Alem dos campos pedidos na spec (sourceUrl, draftText, finalPost,
 * imageKeyword, imageUrl, currentStep), foram adicionados campos de
 * suporte que o pipeline precisa para funcionar de forma segura:
 * - sourceText: texto original extraido pelo ContentExtractor. Sem isso
 *   o InternalAuditor nao tem contra quem comparar o draftText.
 * - auditApproved / auditFeedback / draftAttempts: sustentam o loop
 *   Drafter <-> InternalAuditor com um teto de tentativas (evita loop
 *   infinito se o texto nunca passar na auditoria).
 * - publishedPostId: id do post criado pelo Publisher, util para o
 *   endpoint de trigger retornar algo acionavel ao final do stream.
 * - autoPublish: quem inicia a execucao decide isso, nao o Publisher.
 *   true (rota /api/agent/cron, execucao autonoma agendada) publica direto
 *   quando a auditoria aprova. false/ausente (rota /api/agent/trigger e o
 *   fluxo manual do admin, onde ha um humano acompanhando o SSE em tempo
 *   real) mantem o post como rascunho para revisao humana antes de ir ao
 *   ar, mesmo com auditoria aprovada. Ver publisher.ts.
 */
export const AgentStateAnnotation = Annotation.Root({
  sourceUrl: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  sourceText: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "",
  }),
  draftText: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "",
  }),
  finalPost: Annotation<
    | { titulo: string; conteudo: string; excerpt: string; impact: string; categoryId: string; tagIds: string[]; companies: string[] }
    | undefined
  >({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  imageKeyword: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "",
  }),
  // Fase 4 — resultado estruturado do ImageProcessor. Substitui o antigo
  // `imageUrl: string` (que guardava o hotlink externo direto): agora o
  // mesmo dado (URL final) so existe dentro deste objeto, como
  // finalImageUrl, evitando duplicar o mesmo valor em dois nomes de campo.
  // `undefined` = ImageProcessor ainda nao rodou; `{status:"failed"}` =
  // nenhum tier aprovou uma imagem (ver workflow.ts, roteia para END).
  imageResult: Annotation<ImageProcessingResult | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // og:image extraido do artigo original pelo ContentExtractor — candidato
  // preferencial de imagem principal no ImageProcessor. Tipado como
  // string | undefined (nao string com default ""), igual sourceUrl:
  // e um valor que pode legitimamente nao existir e e checado em branch
  // condicional ("se ogImage existir..."), nao um texto acumulado.
  ogImage: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Fase 4 — og:image:alt da pagina original, quando presente. Unico sinal
  // textual real usado no QA de relevancia da source_og (ver
  // image-pipeline/relevance.ts) — nao inventado quando ausente.
  ogImageAlt: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Dominio oficial da empresa foco da materia, identificado pelo Drafter
  // (LLM). Pode nao existir (materia sem empresa especifica) — mesma
  // logica de tipagem de ogImage acima.
  companyDomain: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // URL do logo da empresa (Clearbit Logo API), resolvida pelo
  // ImageProcessor a partir de companyDomain.
  companyLogoUrl: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  currentStep: Annotation<string>({
    reducer: (_current, next) => next,
    default: () => "Iniciando...",
  }),
  auditApproved: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  auditFeedback: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  draftAttempts: Annotation<number>({
    reducer: (_current, next) => next,
    default: () => 0,
  }),
  publishedPostId: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  autoPublish: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  // Fase 3 — id da linha de agent_queue sendo consumida nesta execucao
  // (setado pela rota /api/agent/cron ANTES de invocar o grafo, quando ha
  // um item pendente). ExactDedupeGate exclui essa propria linha ao checar
  // agent_queue contra duplicidade — sem isso, o registro que a rota acabou
  // de marcar "processed" para ESTA execucao apareceria como uma
  // duplicidade falsa-positiva de si mesma.
  queueItemId: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Fase 6 — id da linha em agent_runs desta execucao (setado pela rota
  // ANTES de invocar/streamar o grafo, quando createRun() teve sucesso).
  // So existe para linkar telemetria de custo por chamada
  // (agent_provider_usage.run_id) ao run correspondente — nao afeta
  // roteamento nem logica de nenhum gate.
  runId: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Resultado do ExactDedupeGate (URL normalizada ja existe em public.posts
  // ou em agent_queue) e do SemanticDedupeGate (mesmo evento, sem/com fato
  // novo). Ver nodes/exact-dedupe.ts e nodes/semantic-dedupe.ts.
  dedupeStatus: Annotation<"unique" | "exact_duplicate" | "same_event_no_material_update" | "same_event_material_update" | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  exactDuplicatePostId: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  materialUpdateReason: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  relatedPostId: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Resultado do NewsworthinessGate — ver nodes/newsworthiness.ts.
  isNewsworthy: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  newsworthinessReason: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  eventDateOrPeriod: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Fase 6 — demais candidatas buscadas pelo NewsFetcher (GNews), na ordem
  // original da API, EXCLUINDO a escolhida para sourceUrl. Usado pelo
  // NextCandidate para tentar a proxima pauta quando um gate rejeita a
  // atual, em vez de encerrar o grafo com a execucao inteira sem
  // publicacao. So existe quando a execucao comecou pelo NewsFetcher
  // (descoberta automatica) — uma URL explicita (admin/fila) nao tem fila
  // de fallback, ver priorityRouter em workflow.ts.
  candidateQueue: Annotation<{ url: string; title: string }[]>({
    reducer: (_current, next) => next,
    default: () => [],
  }),
  // Fase 6 — titulo da candidata atual (sourceUrl), quando conhecido. So o
  // NewsFetcher/NextCandidate preenchem (descoberta automatica tem
  // titulo do GNews); URL explicita via admin/fila fica undefined. Existe
  // separado de sourceUrl so para telemetria (agent_runs.candidate_title)
  // — antes so vivia como texto livre dentro de currentStep.
  candidateTitle: Annotation<string | undefined>({
    reducer: (_current, next) => next,
    default: () => undefined,
  }),
  // Fase 6 — quantas candidatas esta execucao tentou no total (comeca em 1,
  // a escolhida pelo NewsFetcher; NextCandidate incrementa a cada avanco).
  // So para telemetria/painel (agent_runs.candidates_tried) — nao afeta
  // roteamento.
  candidatesTried: Annotation<number>({
    reducer: (_current, next) => next,
    default: () => 1,
  }),
  // Fase 7 (Secao 18) — total de candidatas RETORNADAS pelo GNews nesta
  // execucao (antes de qualquer rejeicao), distinto de candidatesTried
  // (quantas foram de fato processadas ate o motivo terminal). So
  // preenchido no fluxo de descoberta automatica (NewsFetcher); 0 para URL
  // explicita via admin/fila (sem lista de candidatas do GNews).
  candidatesFound: Annotation<number>({
    reducer: (_current, next) => next,
    default: () => 0,
  }),
  // true quando o NextCandidate tentou avancar e a candidateQueue estava
  // vazia — sinaliza ao roteador que o grafo deve encerrar em END, nao
  // seguir para o ExactDedupeGate com um sourceUrl desatualizado.
  candidateExhausted: Annotation<boolean>({
    reducer: (_current, next) => next,
    default: () => false,
  }),
  // Fase 7 (Secao 18/20) — trilha de TODAS as candidatas rejeitadas nesta
  // execucao, com o motivo de cada uma (agent_runs guardava so a ULTIMA
  // candidata; o painel Operacao do Agente precisa mostrar o motivo de
  // rejeicao de CADA candidata tentada). Preenchido por next-candidate.ts
  // ANTES de resetar o state para a proxima tentativa — nunca resetado
  // (acumula do inicio ao fim do run, ao contrario dos campos transitorios
  // abaixo).
  candidateHistory: Annotation<{ url: string; title: string | undefined; reason: string }[]>({
    reducer: (_current, next) => next,
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;
export type AgentStateUpdate = typeof AgentStateAnnotation.Update;
