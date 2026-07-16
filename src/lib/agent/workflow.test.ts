import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 7 (Secao 19) — testes de INTEGRACAO do grafo (workflow.ts), nao dos
// nos individualmente (cada no ja tem cobertura unitaria propria). O que
// falta cobrir aqui e o COMPORTAMENTO DE ROTEAMENTO do NextCandidate:
// rejeicao editorial avanca para a proxima candidata; excecao lancada por
// um no propaga para FORA de agentGraph.invoke() sem passar por
// NextCandidate (edges do LangGraph so roteiam com base no valor
// RETORNADO por um no — uma excecao aborta a execucao inteira, nunca vira
// uma aresta condicional). Isso e exatamente a politica pedida: erro
// sistemico encerra a execucao; rejeicao editorial tenta a proxima.
//
// Cada no e mockado diretamente (nao suas dependencias profundas) porque
// o objetivo aqui e a FIACAO do grafo, nao a logica interna de cada no.

const newsFetcherMock = vi.fn();
const exactDedupeMock = vi.fn();
const contentExtractorMock = vi.fn();
const newsworthinessMock = vi.fn();
const drafterMock = vi.fn();
const internalAuditorMock = vi.fn();
const semanticDedupeMock = vi.fn();
const imageProcessorMock = vi.fn();
const publisherMock = vi.fn();

vi.mock("./nodes/news-fetcher", () => ({ newsFetcherNode: (...a: unknown[]) => newsFetcherMock(...a) }));
vi.mock("./nodes/exact-dedupe", () => ({ exactDedupeNode: (...a: unknown[]) => exactDedupeMock(...a) }));
vi.mock("./nodes/content-extractor", () => ({ contentExtractorNode: (...a: unknown[]) => contentExtractorMock(...a) }));
vi.mock("./nodes/newsworthiness", () => ({ newsworthinessNode: (...a: unknown[]) => newsworthinessMock(...a) }));
vi.mock("./nodes/drafter", () => ({ drafterNode: (...a: unknown[]) => drafterMock(...a), MAX_DRAFT_ATTEMPTS: 5 }));
vi.mock("./nodes/internal-auditor", () => ({ internalAuditorNode: (...a: unknown[]) => internalAuditorMock(...a) }));
vi.mock("./nodes/semantic-dedupe", () => ({ semanticDedupeNode: (...a: unknown[]) => semanticDedupeMock(...a) }));
vi.mock("./nodes/image-processor", () => ({ imageProcessorNode: (...a: unknown[]) => imageProcessorMock(...a) }));
vi.mock("./nodes/publisher", () => ({ publisherNode: (...a: unknown[]) => publisherMock(...a) }));

import { agentGraph } from "./workflow";

beforeEach(() => {
  newsFetcherMock.mockReset();
  exactDedupeMock.mockReset();
  contentExtractorMock.mockReset();
  newsworthinessMock.mockReset();
  drafterMock.mockReset();
  internalAuditorMock.mockReset();
  semanticDedupeMock.mockReset();
  imageProcessorMock.mockReset();
  publisherMock.mockReset();

  // Defaults "felizes" — cada teste sobrescreve so o que precisa rejeitar.
  exactDedupeMock.mockResolvedValue({ dedupeStatus: "unique" });
  contentExtractorMock.mockResolvedValue({ sourceText: "texto extraído" });
  newsworthinessMock.mockResolvedValue({ isNewsworthy: true });
  drafterMock.mockResolvedValue({ finalPost: { titulo: "t", conteudo: "c", excerpt: "e", impact: "i", categoryId: "cat", tagIds: [], companies: [] }, draftAttempts: 1 });
  internalAuditorMock.mockResolvedValue({ auditApproved: true });
  semanticDedupeMock.mockResolvedValue({ dedupeStatus: "unique" });
  imageProcessorMock.mockResolvedValue({ imageResult: { status: "success", origin: "pexels", finalImageUrl: "https://x/y.webp" } });
  publisherMock.mockResolvedValue({ publishedPostId: "post-1" });
});

function candidateQueueOf(count: number) {
  return Array.from({ length: count }, (_, i) => ({ url: `https://exemplo.com/c${i + 1}`, title: `Candidata ${i + 1}` }));
}

describe("agentGraph — NextCandidate integration (Fase 7, Secao 19)", () => {
  it("primeira candidata rejeitada (not_newsworthy), segunda publicada", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(1), candidatesFound: 2 });
    newsworthinessMock.mockResolvedValueOnce({ isNewsworthy: false, newsworthinessReason: "genérico" }).mockResolvedValue({ isNewsworthy: true });

    const result = await agentGraph.invoke({}, { recursionLimit: 60 });

    expect(result.publishedPostId).toBe("post-1");
    expect(result.sourceUrl).toBe("https://exemplo.com/c1");
    expect(newsworthinessMock).toHaveBeenCalledTimes(2);
  });

  it("nove candidatas rejeitadas, décima publicada", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(9), candidatesFound: 10 });
    for (let i = 0; i < 8; i += 1) newsworthinessMock.mockResolvedValueOnce({ isNewsworthy: false, newsworthinessReason: "genérico" });
    newsworthinessMock.mockResolvedValueOnce({ isNewsworthy: false, newsworthinessReason: "genérico" }); // 9ª rejeição (candidata 0..8 = 9 tentativas)
    newsworthinessMock.mockResolvedValue({ isNewsworthy: true }); // 10ª (última) publica

    const result = await agentGraph.invoke({}, { recursionLimit: 60 });

    expect(result.publishedPostId).toBe("post-1");
    expect(newsworthinessMock).toHaveBeenCalledTimes(10);
  });

  it("dez candidatas rejeitadas — fila esgota, execução termina sem publicar", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(9), candidatesFound: 10 });
    newsworthinessMock.mockResolvedValue({ isNewsworthy: false, newsworthinessReason: "genérico" });

    const result = await agentGraph.invoke({}, { recursionLimit: 60 });

    expect(result.publishedPostId).toBeUndefined();
    expect(result.candidateExhausted).toBe(true);
    expect(newsworthinessMock).toHaveBeenCalledTimes(10);
    expect(publisherMock).not.toHaveBeenCalled();
  });

  it("duplicata exata na primeira candidata avança para a segunda via NextCandidate", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(1), candidatesFound: 2 });
    exactDedupeMock.mockResolvedValueOnce({ dedupeStatus: "exact_duplicate", exactDuplicatePostId: "post-existente" }).mockResolvedValue({ dedupeStatus: "unique" });

    const result = await agentGraph.invoke({}, { recursionLimit: 60 });

    expect(result.publishedPostId).toBe("post-1");
    expect(contentExtractorMock).toHaveBeenCalledTimes(1); // só a candidata 2 chegou lá
  });

  it("mesmo evento sem fato novo (SemanticDedupeGate) avança para a próxima candidata", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(1), candidatesFound: 2 });
    semanticDedupeMock.mockResolvedValueOnce({ dedupeStatus: "same_event_no_material_update" }).mockResolvedValue({ dedupeStatus: "unique" });

    const result = await agentGraph.invoke({}, { recursionLimit: 60 });

    expect(result.publishedPostId).toBe("post-1");
    expect(imageProcessorMock).toHaveBeenCalledTimes(1); // só a candidata 2 chegou lá
  });

  it("falha operacional (nó lança exceção) propaga para fora do grafo — NÃO tenta a próxima candidata", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(3), candidatesFound: 4 });
    contentExtractorMock.mockRejectedValue(new Error("Supabase indisponível"));

    await expect(agentGraph.invoke({}, { recursionLimit: 60 })).rejects.toThrow("Supabase indisponível");
    // NextCandidate nunca roda: ContentExtractor não tem aresta condicional
    // para NextCandidate no grafo (workflow.ts) — uma exceção aborta a
    // invocação inteira em vez de virar uma rota de rejeição editorial.
    expect(newsworthinessMock).not.toHaveBeenCalled();
  });

  it("respeita recursionLimit: excede o teto configurado e lança GraphRecursionError", async () => {
    newsFetcherMock.mockResolvedValue({ sourceUrl: "https://exemplo.com/c0", candidateTitle: "Candidata 0", candidateQueue: candidateQueueOf(5), candidatesFound: 6 });
    newsworthinessMock.mockResolvedValue({ isNewsworthy: false, newsworthinessReason: "genérico" });

    await expect(agentGraph.invoke({}, { recursionLimit: 3 })).rejects.toThrow(/recursion/i);
  });
});
