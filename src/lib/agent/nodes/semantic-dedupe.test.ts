import { beforeEach, describe, expect, it, vi } from "vitest";

const listPostsMock = vi.fn();
vi.mock("@/services/editorial", () => ({ editorialRepository: { listPosts: (...a: unknown[]) => listPostsMock(...a) } }));
const invokeMock = vi.fn();
vi.mock("../llm", () => ({ llm: { withStructuredOutput: () => ({ invoke: invokeMock }) } }));
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({ operationsRepository: { log: (...a: unknown[]) => logMock(...a) } }));

import type { AgentState } from "../state";
import { filterRecentRelevantPosts, semanticDedupeNode } from "./semantic-dedupe";

const NOW = new Date("2026-07-09T12:00:00.000Z").getTime();

function recentPost(overrides: Partial<{ id: string; title: string; excerpt: string; createdAt: string; sourceUrl: string; sourceName: string }> = {}) {
  return {
    id: "post-existente",
    title: "Indústria brasileira defende relações comerciais com os EUA",
    excerpt: "Representantes da indústria participam de audiências para contestar tarifas.",
    createdAt: "2026-07-07T02:06:42.530Z",
    sourceUrl: "https://outro.com/audiencia",
    sourceName: "outro.com",
    ...overrides,
  };
}

function finalPost(overrides: Partial<{ titulo: string; conteudo: string; excerpt: string }> = {}) {
  return {
    titulo: "Governo confirma tarifa sobre exportações",
    conteudo: "Corpo qualquer.",
    excerpt: "Governo confirma tarifa sobre exportações brasileiras.",
    impact: "",
    categoryId: "cat-teste",
    tagIds: [],
    companies: [],
    ...overrides,
  };
}

beforeEach(() => {
  listPostsMock.mockReset();
  invokeMock.mockReset();
  logMock.mockReset();
});

describe("filterRecentRelevantPosts — pré-filtro determinístico", () => {
  it("descarta posts fora da janela de 7 dias por created_at", () => {
    const old = recentPost({ createdAt: "2026-06-01T00:00:00.000Z" });
    expect(filterRecentRelevantPosts(finalPost(), [old], undefined, NOW)).toEqual([]);
  });

  it("descarta posts sem sobreposição textual relevante", () => {
    const unrelated = recentPost({ title: "Receita de bolo de cenoura", excerpt: "Como fazer um bolo fofinho." });
    expect(filterRecentRelevantPosts(finalPost(), [unrelated], undefined, NOW)).toEqual([]);
  });

  it("mantém posts recentes com sobreposição textual real", () => {
    const related = recentPost();
    expect(filterRecentRelevantPosts(finalPost({ titulo: "Indústria defende relações comerciais e tarifas com os EUA" }), [related], undefined, NOW)).toEqual([related]);
  });

  it("exclui o próprio sourceUrl da candidata (evita comparar contra si mesma)", () => {
    const self = recentPost({ sourceUrl: "https://exemplo.com/materia" });
    expect(filterRecentRelevantPosts(finalPost({ titulo: self.title, excerpt: self.excerpt }), [self], "https://exemplo.com/materia", NOW)).toEqual([]);
  });
});

describe("semanticDedupeNode", () => {
  function state(overrides: Partial<AgentState> = {}): AgentState {
    return { sourceUrl: "https://novo.com/materia", finalPost: finalPost(), ...overrides } as AgentState;
  }

  it("unique quando não há posts recentes relevantes — não chama o LLM", async () => {
    listPostsMock.mockResolvedValue([]);
    const result = await semanticDedupeNode(state());
    expect(result.dedupeStatus).toBe("unique");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("same_event_no_material_update quando o LLM decide que não há fato novo", async () => {
    listPostsMock.mockResolvedValue([recentPost()]);
    invokeMock.mockResolvedValue({ dedupeStatus: "same_event_no_material_update", materialUpdateReason: null, relatedPostId: "post-existente" });
    const result = await semanticDedupeNode(state({ finalPost: finalPost({ titulo: recentPost().title, excerpt: recentPost().excerpt }) }));
    expect(result.dedupeStatus).toBe("same_event_no_material_update");
    expect(result.materialUpdateReason).toBeUndefined();
    expect(result.relatedPostId).toBe("post-existente");
  });

  it("same_event_material_update preserva o materialUpdateReason", async () => {
    listPostsMock.mockResolvedValue([recentPost()]);
    invokeMock.mockResolvedValue({
      dedupeStatus: "same_event_material_update",
      materialUpdateReason: "Nova alíquota de 25% foi confirmada em 9 de julho.",
      relatedPostId: "post-existente",
    });
    const result = await semanticDedupeNode(state({ finalPost: finalPost({ titulo: recentPost().title, excerpt: recentPost().excerpt }) }));
    expect(result.dedupeStatus).toBe("same_event_material_update");
    expect(result.materialUpdateReason).toMatch(/25%/);
  });

  it("relatedPostId fora da lista de posts comparados é descartado (não referencia post não validado)", async () => {
    listPostsMock.mockResolvedValue([recentPost()]);
    invokeMock.mockResolvedValue({ dedupeStatus: "same_event_no_material_update", materialUpdateReason: null, relatedPostId: "post-nao-comparado" });
    const result = await semanticDedupeNode(state({ finalPost: finalPost({ titulo: recentPost().title, excerpt: recentPost().excerpt }) }));
    expect(result.relatedPostId).toBeUndefined();
  });
});
