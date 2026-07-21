import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
// Fase 7 — internalAuditorNode agora chama .invoke() com includeRaw:true
// (formato {raw,parsed}); o wrapper abaixo deixa os testes existentes
// controlarem so o `parsed` via invokeMock.mockResolvedValue(...), como
// antes.
vi.mock("../llm", () => ({
  llm: { withStructuredOutput: () => ({ invoke: async (...args: unknown[]) => ({ raw: {}, parsed: await invokeMock(...args) }) }) },
}));

const listCategoriesMock = vi.fn();
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  },
}));
vi.mock("../costs/usage-repository", () => ({ recordProviderUsage: vi.fn().mockResolvedValue(undefined) }));

import type { AgentState } from "../state";
import { internalAuditorNode } from "./internal-auditor";

const VALID_CATEGORIES = [
  { id: "cat-teste", name: "Categoria de Teste", slug: "categoria-de-teste", description: "" },
  { id: "cat-outra", name: "Outra Categoria", slug: "outra-categoria", description: "" },
];

function baseFinalPost(overrides: Partial<NonNullable<AgentState["finalPost"]>> = {}): NonNullable<AgentState["finalPost"]> {
  return {
    titulo: "Título válido",
    conteudo: "Corpo da matéria reescrita, sem qualquer menção comercial.",
    excerpt: "Resumo válido do fato central da notícia.",
    impact: "O movimento pode indicar atenção redobrada ao setor produtivo nos próximos meses.",
    categoryId: "cat-teste",
    tagIds: [],
    companies: [],
    segmentSlugs: [],
    ...overrides,
  };
}

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    sourceUrl: "https://example.com/noticia",
    sourceText: "Texto original de teste sobre a indústria.",
    draftText: "Corpo da matéria reescrita, sem qualquer menção comercial.",
    finalPost: baseFinalPost(),
    imageKeyword: "",
    imageResult: undefined,
    ogImage: undefined,
    ogImageAlt: undefined,
    companyDomain: undefined,
    companyLogoUrl: undefined,
    currentStep: "",
    auditApproved: false,
    auditFeedback: undefined,
    draftAttempts: 1,
    publishedPostId: undefined,
    autoPublish: false,
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
    candidatesFound: 1,
    candidateHistory: [],
    candidateTitle: undefined,
    runId: undefined,
    ...overrides,
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  listCategoriesMock.mockReset();
  listCategoriesMock.mockResolvedValue(VALID_CATEGORIES);
});

describe("internalAuditorNode — validação mecânica de excerpt/impact (Fase 2)", () => {
  it("reprova mecanicamente (sem chamar o LLM) quando excerpt termina em reticências", async () => {
    const state = baseState({
      finalPost: baseFinalPost({ excerpt: "Resumo cortado no meio da…" }),
    });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/excerpt/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reprova mecanicamente quando impact está vazio", async () => {
    const state = baseState({ finalPost: baseFinalPost({ impact: "" }) });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/impact/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reprova mecanicamente quando impact é idêntico ao excerpt", async () => {
    const excerpt = "A indústria paulista recuou no primeiro semestre de 2026.";
    const state = baseState({ finalPost: baseFinalPost({ excerpt, impact: excerpt }) });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/impact/i);
  });

  it("NÃO exige CTA/menção à V360 — um draftText sem qualquer menção comercial passa da etapa mecânica", async () => {
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    const result = await internalAuditorNode(baseState());
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.auditApproved).toBe(true);
  });

  it("a reprovação mecânica nunca menciona ':::highlight' ou exigência de CTA (checagem removida na Fase 2)", async () => {
    const state = baseState({
      finalPost: baseFinalPost({ excerpt: "Resumo cortado…" }),
    });
    const result = await internalAuditorNode(state);
    expect(result.auditFeedback).not.toMatch(/highlight/i);
    expect(result.auditFeedback).not.toMatch(/CTA/i);
  });

  it("aprova (delega ao LLM) quando excerpt e impact são válidos e distintos entre si", async () => {
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    const result = await internalAuditorNode(baseState());
    expect(result.auditApproved).toBe(true);
    expect(result.currentStep).toMatch(/aprovada/i);
  });
});

describe("internalAuditorNode — validação mecânica de categoryId (Fase 3)", () => {
  it("reprova mecanicamente quando categoryId está ausente", async () => {
    const state = baseState({ finalPost: baseFinalPost({ categoryId: "" }) });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/categoryId/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reprova mecanicamente quando categoryId não pertence à lista real de categorias", async () => {
    const state = baseState({ finalPost: baseFinalPost({ categoryId: "cat-industria-4-0" }) });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/categoryId/);
    expect(result.auditFeedback).toMatch(/não existe/);
  });

  it("aprova (mecanicamente) quando categoryId pertence à lista real de categorias", async () => {
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    const result = await internalAuditorNode(baseState({ finalPost: baseFinalPost({ categoryId: "cat-outra" }) }));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.auditApproved).toBe(true);
  });

  it("nunca usa cat-industria-4-0 como fallback mesmo quando ele existir na lista", async () => {
    listCategoriesMock.mockResolvedValue([...VALID_CATEGORIES, { id: "cat-industria-4-0", name: "Indústria 4.0", slug: "industria-4-0", description: "" }]);
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    // categoryId explicito e diferente do "fallback" antigo — nao deve ser sobrescrito nem rejeitado por nao ser o antigo default.
    const result = await internalAuditorNode(baseState({ finalPost: baseFinalPost({ categoryId: "cat-outra" }) }));
    expect(result.auditApproved).toBe(true);
  });
});

describe("internalAuditorNode — validação mecânica de citação direta (Fase 3)", () => {
  it("reprova quando o corpo contém citação entre aspas que não existe literalmente na fonte", async () => {
    const state = baseState({
      sourceText: "O ministro falou sobre investimentos no setor industrial durante o evento.",
      draftText: 'O ministro afirmou: "Vamos triplicar os investimentos até o fim do ano que vem".',
      finalPost: baseFinalPost({ conteudo: 'O ministro afirmou: "Vamos triplicar os investimentos até o fim do ano que vem".' }),
    });
    const result = await internalAuditorNode(state);
    expect(result.auditApproved).toBe(false);
    expect(result.auditFeedback).toMatch(/citaç/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("aprova (mecanicamente) quando a citação existe literalmente na fonte", async () => {
    const quote = "Vamos triplicar os investimentos até o fim do ano que vem";
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    const state = baseState({
      sourceText: `O ministro afirmou: "${quote}", durante o evento.`,
      draftText: `O ministro declarou: "${quote}".`,
      finalPost: baseFinalPost({ conteudo: `O ministro declarou: "${quote}".` }),
    });
    const result = await internalAuditorNode(state);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.auditApproved).toBe(true);
  });

  it("não reprova termos curtos entre aspas (nome de programa, apelido)", async () => {
    invokeMock.mockResolvedValue({ approved: true, issues: [], feedback: "" });
    const state = baseState({
      sourceText: "A empresa lançou o programa interno de qualificação de mão de obra.",
      draftText: 'A empresa lançou o "Programa Impulso" para qualificar mão de obra local.',
      finalPost: baseFinalPost({ conteudo: 'A empresa lançou o "Programa Impulso" para qualificar mão de obra local.' }),
    });
    const result = await internalAuditorNode(state);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.auditApproved).toBe(true);
  });
});
