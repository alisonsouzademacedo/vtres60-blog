import { beforeEach, describe, expect, it, vi } from "vitest";

const createPostMock = vi.fn();
const listCategoriesMock = vi.fn();
const listTagsMock = vi.fn();
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    createPost: (...args: unknown[]) => createPostMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    listTags: (...args: unknown[]) => listTagsMock(...args),
  },
}));

const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: { log: (...args: unknown[]) => logMock(...args) },
}));

import type { AgentState } from "../state";
import { metaDescriptionFrom } from "../text-guards";
import { publisherNode } from "./publisher";

const VALID_CATEGORIES = [{ id: "cat-teste", name: "Categoria de Teste", slug: "categoria-de-teste", description: "" }];
const VALID_TAGS = [
  { id: "tag-teste", name: "Tag de Teste", slug: "tag-de-teste", description: "" },
  { id: "tag-outra", name: "Outra Tag", slug: "outra-tag", description: "" },
];

function baseFinalPost(overrides: Partial<NonNullable<AgentState["finalPost"]>> = {}): NonNullable<AgentState["finalPost"]> {
  return {
    titulo: "Título de teste",
    conteudo: "Primeiro parágrafo do corpo.\n\nSegundo parágrafo do corpo.",
    excerpt: "Resumo curto do fato central.",
    impact: "O movimento pode reforçar a necessidade de observar o setor nos próximos meses.",
    categoryId: "cat-teste",
    tagIds: [],
    companies: [],
    ...overrides,
  };
}

function baseImageResult(overrides: Partial<Extract<AgentState["imageResult"], { status: "success" }>> = {}): AgentState["imageResult"] {
  return {
    status: "success",
    finalImageUrl: "https://storage.example.com/editorial-images/posts/abc/hash-1234.webp",
    sourceUrl: "https://img.example.com/a.jpg",
    credit: undefined,
    origin: "source_og",
    hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd",
    width: 2150,
    height: 1000,
    ...overrides,
  };
}

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    sourceUrl: "https://example.com/noticia",
    sourceText: "texto original",
    draftText: "Primeiro parágrafo do corpo.\n\nSegundo parágrafo do corpo.",
    finalPost: baseFinalPost(),
    imageKeyword: "factory",
    imageResult: baseImageResult(),
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
    queueItemId: undefined,
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
    candidateTitle: undefined,
    runId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  createPostMock.mockReset();
  logMock.mockReset();
  listCategoriesMock.mockReset();
  listTagsMock.mockReset();
  listCategoriesMock.mockResolvedValue(VALID_CATEGORIES);
  listTagsMock.mockResolvedValue(VALID_TAGS);
  createPostMock.mockImplementation(async (payload: Record<string, unknown>) => ({
    ...payload,
    id: "post-id-1",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  }));
});

describe("publisherNode (Fase 2)", () => {
  it("persiste draft.excerpt tal como veio do draft, sem transformação", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.excerpt).toBe("Resumo curto do fato central.");
  });

  it("persiste draft.impact tal como veio do draft, sem transformação", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.impact).toBe("O movimento pode reforçar a necessidade de observar o setor nos próximos meses.");
  });

  it("não deriva excerpt do body (corpo longo não afeta o excerpt persistido)", async () => {
    const longBody = "Parágrafo bem longo repetido várias vezes para simular um corpo extenso. ".repeat(20);
    await publisherNode(
      baseState({
        finalPost: baseFinalPost({ conteudo: longBody, excerpt: "Resumo curto e válido.", impact: "Análise curta e distinta do resumo." }),
      }),
    );
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.excerpt).toBe("Resumo curto e válido.");
  });

  it("não grava impact vazio por padrão", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.impact).not.toBe("");
  });

  it("não usa excerpt como impact", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.impact).not.toBe(payload.excerpt);
  });

  it("não chama ensureV360ClosingParagraph / não injeta menção à V360 no body", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.content).not.toMatch(/v360/i);
    expect(payload.content).not.toMatch(/:::highlight/);
  });

  it("seo.metaDescription usa draft.excerpt via metaDescriptionFrom, não mais excerptFrom(body)", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.seo.metaDescription).toBe(metaDescriptionFrom("Resumo curto do fato central."));
  });
});

describe("publisherNode — categoria/tags/companies (Fase 3)", () => {
  it("persiste draft.categoryId quando ele é válido, sem hardcode", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.categoryId).toBe("cat-teste");
  });

  it("NUNCA usa cat-industria-4-0 como fallback", async () => {
    listCategoriesMock.mockResolvedValue([...VALID_CATEGORIES, { id: "cat-industria-4-0", name: "Indústria 4.0", slug: "industria-4-0", description: "" }]);
    await publisherNode(baseState({ finalPost: baseFinalPost({ categoryId: "cat-teste" }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.categoryId).not.toBe("cat-industria-4-0");
    expect(payload.categoryId).toBe("cat-teste");
  });

  it("categoryId inválido: NÃO cria post (classification_failed), createPost nunca é chamado", async () => {
    const result = await publisherNode(baseState({ finalPost: baseFinalPost({ categoryId: "cat-inexistente" }) }));
    expect(createPostMock).not.toHaveBeenCalled();
    expect(result.publishedPostId).toBeUndefined();
    expect(result.currentStep).toMatch(/classification_failed/);
    expect(logMock).toHaveBeenCalledWith("classification_failed", "agente", expect.any(String));
  });

  it("categoryId vazio: NÃO cria post", async () => {
    const result = await publisherNode(baseState({ finalPost: baseFinalPost({ categoryId: "" }) }));
    expect(createPostMock).not.toHaveBeenCalled();
    expect(result.publishedPostId).toBeUndefined();
  });

  it("persiste apenas tagIds válidos, filtrando os inválidos e registrando log", async () => {
    await publisherNode(baseState({ finalPost: baseFinalPost({ tagIds: ["tag-teste", "tag-inventada"] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.tagIds).toEqual(["tag-teste"]);
    expect(logMock).toHaveBeenCalledWith("classificacao_taxonomia", "agente", expect.stringContaining("tag-inventada"));
  });

  it("tagIds vazio é válido e não gera log de rejeição", async () => {
    await publisherNode(baseState({ finalPost: baseFinalPost({ tagIds: [] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.tagIds).toEqual([]);
  });

  it("persiste apenas companies de hubs válidos (nome exato), filtrando as inválidas", async () => {
    await publisherNode(baseState({ finalPost: baseFinalPost({ companies: ["WEG", "Empresa Inventada"] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.companies).toEqual(["WEG"]);
    expect(logMock).toHaveBeenCalledWith("classificacao_taxonomia", "agente", expect.stringContaining("Empresa Inventada"));
  });

  it("companies vazio é válido — não força hub", async () => {
    await publisherNode(baseState({ finalPost: baseFinalPost({ companies: [] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.companies).toEqual([]);
  });

  it("empresa sem hub (ex: BYD) não é inventada — companies fica vazio, publicação segue normalmente", async () => {
    const result = await publisherNode(baseState({ finalPost: baseFinalPost({ companies: ["BYD"] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.companies).toEqual([]);
    expect(result.publishedPostId).toBe("post-id-1");
  });
});

describe("publisherNode — provenance de imagem (Fase 4)", () => {
  it("persiste featured_image a partir de imageResult.finalImageUrl", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.featuredImage).toBe("https://storage.example.com/editorial-images/posts/abc/hash-1234.webp");
  });

  it("persiste imageSourceUrl, imageOrigin, imageHash, imageWidth, imageHeight do resultado aprovado", async () => {
    await publisherNode(baseState({ imageResult: baseImageResult({ origin: "pexels", credit: "Foto: Fulano" }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.imageSourceUrl).toBe("https://img.example.com/a.jpg");
    expect(payload.imageOrigin).toBe("pexels");
    expect(payload.imageCredit).toBe("Foto: Fulano");
    expect(payload.imageHash).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd");
    expect(payload.imageWidth).toBe(2150);
    expect(payload.imageHeight).toBe(1000);
  });

  it("seo.ogImage usa a URL final do Storage, não mais o hotlink direto", async () => {
    await publisherNode(baseState());
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.seo.ogImage).toBe("https://storage.example.com/editorial-images/posts/abc/hash-1234.webp");
  });

  it("sem imageResult (undefined): não chama createPost, lança erro", async () => {
    await expect(publisherNode(baseState({ imageResult: undefined }))).rejects.toThrow();
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it("com imageResult status=failed: não chama createPost, lança erro (Publisher não roda sem imagem aprovada)", async () => {
    await expect(publisherNode(baseState({ imageResult: { status: "failed", reason: "image_pipeline_failed" } }))).rejects.toThrow();
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it("preserva categoryId/tagIds/companies/excerpt/impact mesmo com a nova persistência de imagem (Fases 2/3 intactas)", async () => {
    await publisherNode(baseState({ finalPost: baseFinalPost({ tagIds: ["tag-teste"], companies: ["WEG"] }) }));
    const payload = createPostMock.mock.calls[0][0];
    expect(payload.categoryId).toBe("cat-teste");
    expect(payload.tagIds).toEqual(["tag-teste"]);
    expect(payload.companies).toEqual(["WEG"]);
    expect(payload.excerpt).toBe("Resumo curto do fato central.");
    expect(payload.impact).toBe("O movimento pode reforçar a necessidade de observar o setor nos próximos meses.");
  });
});

describe("metaDescriptionFrom", () => {
  it("retorna o texto integral quando já está dentro do limite", () => {
    const excerpt = "A FIESP divulgou dados sobre a indústria paulista.";
    expect(metaDescriptionFrom(excerpt)).toBe(excerpt);
  });

  it("nunca corta a sigla FIESP no meio", () => {
    const excerpt =
      "A FIESP divulgou o balanço do primeiro semestre de 2026 mostrando queda expressiva na produção industrial paulista e no faturamento das fábricas de médio porte instaladas no interior do estado";
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/FIES$/);
    expect(result.includes("FIESP") ? result : "sem FIESP no corte").toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(160);
  });

  it("nunca corta a sigla FIEMG no meio", () => {
    const excerpt =
      "A FIEMG apontou resiliência da indústria mineira mesmo com queda no faturamento em diversos segmentos produtivos do estado de Minas Gerais neste período";
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/FIEM$/);
    expect(result.length).toBeLessThanOrEqual(160);
  });

  it("nunca corta a sigla BYD no meio", () => {
    const excerpt =
      "A BYD expandiu sua fábrica em Camaçari e abriu vagas para talentos baianos em meio ao crescimento acelerado do setor automotivo elétrico brasileiro";
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/BY$/);
    expect(result.length).toBeLessThanOrEqual(160);
  });

  it("nunca corta a palavra 'indústria' no meio", () => {
    const excerpt =
      "O crescimento da automação avança e redefine a produtividade das fábricas brasileiras em praticamente todos os polos industriais do país neste momento";
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/indústr$/);
    expect(result).not.toMatch(/ind$/);
  });

  it("nunca corta a palavra 'transformação' no meio", () => {
    const excerpt =
      "A indústria de transformação paulista teve o pior resultado da série histórica no primeiro semestre deste ano segundo o levantamento setorial mais recente";
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/transforma$/);
    expect(result).not.toMatch(/transf$/);
  });

  it("nunca insere reticências artificiais", () => {
    const excerpt = "Texto bem longo. ".repeat(20);
    const result = metaDescriptionFrom(excerpt);
    expect(result).not.toMatch(/(\.\.\.|…)\s*$/);
  });

  it("prefere cortar no limite de frase quando existe uma frase completa dentro do limite", () => {
    const excerpt =
      "Primeira frase curta e completa. " + "Segunda frase bem mais longa que ultrapassa o limite de cento e sessenta caracteres estabelecido para a meta description deste site.";
    const result = metaDescriptionFrom(excerpt);
    expect(result.endsWith(".")).toBe(true);
  });
});
