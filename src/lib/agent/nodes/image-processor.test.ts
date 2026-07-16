import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentState, AgentStateUpdate } from "../state";
import { makeCorruptBuffer, makeJpegBuffer } from "../image-pipeline/test-fixtures";
import type { ImageProcessingResult } from "../image-pipeline/types";

// AgentStateUpdate envolve os campos em OverwriteValue<T> internamente
// (mecanismo do LangGraph Annotation) — em runtime o valor e sempre o
// objeto puro (reducer e (_current,next)=>next, substituicao total), so o
// tipo estatico e que precisa dessa normalizacao para os testes acessarem
// campos aninhados.
function asImageResult(value: AgentStateUpdate["imageResult"]): ImageProcessingResult | undefined {
  return value as ImageProcessingResult | undefined;
}

// Fronteiras externas mockadas (rede/DB/provider) — mesma filosofia dos
// outros testes de nó do agente (mockar llm/editorialRepository). O que
// fica REAL aqui: processing.ts (sharp de verdade), relevance.ts,
// replicate-prompt.ts — a lógica de decisão/processamento é exercitada de
// verdade, só a fronteira de I/O externo é substituída.
const downloadImageMock = vi.fn();
vi.mock("../image-pipeline/download", () => ({ downloadImage: (...args: unknown[]) => downloadImageMock(...args) }));

const fetchPexelsCandidatesMock = vi.fn();
const generateWithReplicateMock = vi.fn();
vi.mock("../image-pipeline/providers", () => ({
  fetchPexelsCandidates: (...args: unknown[]) => fetchPexelsCandidatesMock(...args),
  generateWithReplicate: (...args: unknown[]) => generateWithReplicateMock(...args),
}));

const uploadToEditorialStorageMock = vi.fn();
vi.mock("../image-pipeline/storage", () => ({
  buildStoragePath: (stableId: string, hash: string) => `posts/${stableId}/${hash.slice(0, 8)}.webp`,
  uploadToEditorialStorage: (...args: unknown[]) => uploadToEditorialStorageMock(...args),
}));

const isImageDuplicateMock = vi.fn();
vi.mock("../image-pipeline/dedupe", () => ({ isImageDuplicate: (...args: unknown[]) => isImageDuplicateMock(...args) }));

const logMock = vi.fn();
vi.mock("@/services/operations", () => ({ operationsRepository: { log: (...args: unknown[]) => logMock(...args) } }));

const listCategoriesMock = vi.fn();
vi.mock("../taxonomies", () => ({ loadValidCategories: (...args: unknown[]) => listCategoriesMock(...args) }));

import { imageProcessorNode } from "./image-processor";

const GOOD_JPEG = () => makeJpegBuffer(2400, 1200);
const LOW_RES_JPEG = () => makeJpegBuffer(400, 200);

function baseFinalPost(overrides: Partial<NonNullable<AgentState["finalPost"]>> = {}): NonNullable<AgentState["finalPost"]> {
  return {
    titulo: "BYD integra 207 colaboradores em nova etapa da fábrica de Camaçari",
    conteudo: "Corpo completo da matéria, com todos os parágrafos e detalhes internos da notícia original.",
    excerpt: "A BYD anunciou a integração de 207 novos colaboradores na fábrica de Camaçari.",
    impact: "O movimento reforça a expansão da produção automotiva elétrica no Nordeste.",
    categoryId: "cat-automotivo",
    tagIds: [],
    companies: [],
    ...overrides,
  };
}

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    sourceUrl: "https://example.com/noticia-byd",
    sourceText: "texto original",
    draftText: "",
    finalPost: baseFinalPost(),
    imageKeyword: "automotive factory workforce",
    imageResult: undefined,
    ogImage: undefined,
    ogImageAlt: undefined,
    companyDomain: undefined,
    companyLogoUrl: undefined,
    currentStep: "",
    auditApproved: true,
    auditFeedback: undefined,
    draftAttempts: 1,
    publishedPostId: undefined,
    autoPublish: true,
    queueItemId: "queue-item-1",
    dedupeStatus: undefined,
    exactDuplicatePostId: undefined,
    materialUpdateReason: undefined,
    relatedPostId: undefined,
    isNewsworthy: true,
    newsworthinessReason: undefined,
    eventDateOrPeriod: undefined,
    candidateQueue: [],
    candidateExhausted: false,
    candidatesTried: 1,
    candidatesFound: 1,
    candidateHistory: [],
    candidateTitle: undefined,
    runId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  downloadImageMock.mockReset();
  fetchPexelsCandidatesMock.mockReset();
  generateWithReplicateMock.mockReset();
  uploadToEditorialStorageMock.mockReset();
  isImageDuplicateMock.mockReset();
  logMock.mockReset();
  listCategoriesMock.mockReset();
  listCategoriesMock.mockResolvedValue([{ id: "cat-automotivo", name: "Automotivo", description: "" }]);
  isImageDuplicateMock.mockResolvedValue(false);
  uploadToEditorialStorageMock.mockResolvedValue({ ok: true, publicUrl: "https://storage.example/editorial-images/final.webp" });
});

describe("imageProcessorNode — Cenário A (BYD): source_og aprovada", () => {
  it("usa source_og quando ela é válida, relevante e com resolução suficiente", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });
    const state = baseState({ ogImage: "https://example.com/noticia-byd/foto.jpg" });

    const result = await imageProcessorNode(state);
    const imageResult = asImageResult(result.imageResult);

    expect(imageResult?.status).toBe("success");
    if (imageResult?.status === "success") {
      expect(imageResult.origin).toBe("source_og");
      expect(imageResult.sourceUrl).toBe("https://example.com/noticia-byd/foto.jpg");
      expect(imageResult.finalImageUrl).toBe("https://storage.example/editorial-images/final.webp");
    }
    expect(generateWithReplicateMock).not.toHaveBeenCalled();
    expect(fetchPexelsCandidatesMock).not.toHaveBeenCalled();
  });

  it("quando source_og falha, cai para generated_replicate com prompt que não fabrica o evento documental", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: false, reason: "download_failed" }); // og:image falha
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" }); // download do output do Replicate

    const state = baseState({ ogImage: "https://example.com/noticia-byd/foto.jpg" });
    const result = await imageProcessorNode(state);
    const imageResult = asImageResult(result.imageResult);

    expect(imageResult?.status).toBe("success");
    if (imageResult?.status === "success") {
      expect(imageResult.origin).toBe("generated_replicate");
    }
    const prompt = generateWithReplicateMock.mock.calls[0][0] as string;
    // Regra crítica (Seção 24/30 do spec): nunca apresentar como fotografia
    // documental do evento real, e nunca fabricar logo da empresa.
    expect(prompt).toMatch(/NOT a documentary photograph/);
    expect(prompt).toMatch(/no invented logos/i);
    expect(prompt).toContain("BYD integra 207 colaboradores");
    // Não envia o corpo completo da matéria (conteudo) — só titulo/excerpt/impact/keyword/categoria.
    expect(prompt).not.toContain("Corpo completo da matéria");
  });
});

describe("imageProcessorNode — cascata de fallback (Cenário E)", () => {
  it("source_og ausente + Replicate aprovado -> sucesso via generated_replicate", async () => {
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" });

    const result = await imageProcessorNode(baseState({ ogImage: undefined }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "generated_replicate" });
  });

  it("source_og ausente + Replicate falha + Pexels aprovado -> sucesso via pexels", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([
      { url: "https://pexels.example/a.jpg", photographer: "Fulano", photographerUrl: "https://pexels.example/fulano", pageUrl: "https://pexels.example/photo/1" },
    ]);
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });

    const result = await imageProcessorNode(baseState({ ogImage: undefined }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "pexels", credit: "Foto: Fulano (https://pexels.example/fulano)" });
  });

  it("todos os tiers falham -> image_pipeline_failed, Publisher não deve rodar (roteamento é feito pelo workflow.ts)", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([]);

    const result = await imageProcessorNode(baseState({ ogImage: undefined }));

    expect(result.imageResult).toEqual({ status: "failed", reason: "image_pipeline_failed" });
    expect(logMock).toHaveBeenCalledWith("image_tier_failure", "agente", expect.stringContaining("image_pipeline_failed"));
  });

  it("nenhum placeholder é usado — image_pipeline_failed nunca contém URL do via.placeholder.com", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([]);
    const result = await imageProcessorNode(baseState({ ogImage: undefined }));
    expect(JSON.stringify(result)).not.toContain("placeholder.com");
  });
});

describe("imageProcessorNode — Cenário C (dedupe): imagem duplicada tenta próximo tier", () => {
  it("source_og duplicada não bloqueia a notícia — cai para Replicate", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });
    isImageDuplicateMock.mockResolvedValueOnce(true); // source_og é duplicada
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" });
    isImageDuplicateMock.mockResolvedValueOnce(false); // Replicate não é duplicada

    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto.jpg" }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "generated_replicate" });
  });
});

describe("imageProcessorNode — Cenário F/G/H (QA técnico real via processing.ts)", () => {
  it("source_og com resolução insuficiente (Cenário F) é rejeitada e cai para o próximo tier", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await LOW_RES_JPEG(), contentType: "image/jpeg" });
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" });

    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto-pequena.jpg" }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "generated_replicate" });
    expect(logMock).toHaveBeenCalledWith("image_tier_failure", "agente", expect.stringContaining("resolution_too_low"));
  });

  it("Content-Type inválido (Cenário G, já filtrado em download.ts) é tratado como falha do tier", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: false, reason: "invalid_content_type" });
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" });

    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto.jpg" }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "generated_replicate" });
    expect(logMock).toHaveBeenCalledWith("image_tier_failure", "agente", expect.stringContaining("invalid_content_type"));
  });

  it("bytes corrompidos (Cenário H) são rejeitados via decode_failed real e cai para o próximo tier", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: makeCorruptBuffer(), contentType: "image/jpeg" });
    generateWithReplicateMock.mockResolvedValueOnce("https://replicate.example/output.png");
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/png" });

    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto-corrompida.jpg" }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "generated_replicate" });
    expect(logMock).toHaveBeenCalledWith("image_tier_failure", "agente", expect.stringContaining("decode_failed"));
  });
});

describe("imageProcessorNode — Pexels com múltiplas candidatas", () => {
  it("primeira candidata Pexels inválida -> tenta a segunda", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([
      { url: "https://pexels.example/ruim.jpg", photographer: "Ruim", photographerUrl: undefined, pageUrl: undefined },
      { url: "https://pexels.example/boa.jpg", photographer: "Boa Foto", photographerUrl: "https://pexels.example/boa", pageUrl: "https://pexels.example/photo/2" },
    ]);
    downloadImageMock
      .mockResolvedValueOnce({ ok: false, reason: "download_failed" }) // primeira candidata falha
      .mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" }); // segunda funciona

    const result = await imageProcessorNode(baseState({ ogImage: undefined }));

    expect(result.imageResult).toMatchObject({ status: "success", origin: "pexels", credit: "Foto: Boa Foto (https://pexels.example/boa)" });
  });

  it("nenhuma candidata Pexels retornada -> no_pexels_candidate, pipeline falha", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([]);

    const result = await imageProcessorNode(baseState({ ogImage: undefined }));

    expect(result.imageResult).toEqual({ status: "failed", reason: "image_pipeline_failed" });
    expect(logMock).toHaveBeenCalledWith("image_tier_failure", "agente", expect.stringContaining("no_pexels_candidate"));
  });
});

describe("imageProcessorNode — companyLogoUrl permanece separado da imagem principal", () => {
  it("resolve companyLogoUrl via Google Favicons independente do tier de imagem usado", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });
    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto.jpg", companyDomain: "byd.com" }));
    expect(result.companyLogoUrl).toBe("https://www.google.com/s2/favicons?domain=byd.com&sz=256");
    expect(JSON.stringify(result.imageResult)).not.toContain("favicons");
  });
});

describe("imageProcessorNode — provenance por tier (Seção 61 do spec)", () => {
  it("source_og: credit undefined (nenhum sinal confiável de fotógrafo)", async () => {
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });
    const result = await imageProcessorNode(baseState({ ogImage: "https://example.com/foto.jpg" }));
    const imageResult = asImageResult(result.imageResult);
    if (imageResult?.status === "success") {
      expect(imageResult.credit).toBeUndefined();
    }
  });

  it("pexels: credit vem dos campos reais da API (photographer/photographer_url)", async () => {
    generateWithReplicateMock.mockResolvedValueOnce(undefined);
    fetchPexelsCandidatesMock.mockResolvedValueOnce([
      { url: "https://pexels.example/a.jpg", photographer: "Ciclano", photographerUrl: "https://pexels.example/ciclano", pageUrl: "https://pexels.example/photo/3" },
    ]);
    downloadImageMock.mockResolvedValueOnce({ ok: true, buffer: await GOOD_JPEG(), contentType: "image/jpeg" });
    const result = await imageProcessorNode(baseState({ ogImage: undefined }));
    const imageResult = asImageResult(result.imageResult);
    if (imageResult?.status === "success") {
      expect(imageResult.credit).toBe("Foto: Ciclano (https://pexels.example/ciclano)");
      expect(imageResult.sourceUrl).toBe("https://pexels.example/photo/3");
    }
  });
});
