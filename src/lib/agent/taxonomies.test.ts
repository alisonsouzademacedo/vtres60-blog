import { describe, expect, it, vi } from "vitest";

const listCategoriesMock = vi.fn();
const listTagsMock = vi.fn();
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    listTags: (...args: unknown[]) => listTagsMock(...args),
  },
}));

const listSegmentsMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    listSegments: (...args: unknown[]) => listSegmentsMock(...args),
  },
}));

import {
  filterValidCompanies,
  filterValidSegmentSlugs,
  filterValidTagIds,
  isValidCategoryId,
  loadValidCategories,
  loadValidCompanyHubs,
  loadValidSegments,
  loadValidTags,
} from "./taxonomies";

describe("loadValidCategories / loadValidTags — fonte canônica real", () => {
  it("carrega categorias de editorialRepository.listCategories(), sem duplicar lista manualmente", async () => {
    listCategoriesMock.mockResolvedValue([
      { id: "cat-a", name: "A", slug: "a", description: "desc a", extraField: "ignorar" },
    ]);
    const categories = await loadValidCategories();
    expect(categories).toEqual([{ id: "cat-a", name: "A", description: "desc a" }]);
    expect(listCategoriesMock).toHaveBeenCalledTimes(1);
  });

  it("carrega tags de editorialRepository.listTags()", async () => {
    listTagsMock.mockResolvedValue([{ id: "tag-a", name: "A", slug: "a", description: "" }]);
    const tags = await loadValidTags();
    expect(tags).toEqual([{ id: "tag-a", name: "A" }]);
  });
});

describe("loadValidCompanyHubs — fonte estática real (src/data/content.ts)", () => {
  it("retorna os hubs reais definidos, incluindo WEG", () => {
    const hubs = loadValidCompanyHubs();
    expect(hubs.map((h) => h.name)).toContain("WEG");
  });

  it("não inclui BYD (sem hub editorial hoje)", () => {
    const hubs = loadValidCompanyHubs();
    expect(hubs.map((h) => h.name)).not.toContain("BYD");
  });
});

describe("isValidCategoryId", () => {
  const categories = [{ id: "cat-a", name: "A", description: "" }];
  it("true para id existente", () => expect(isValidCategoryId("cat-a", categories)).toBe(true));
  it("false para id inexistente", () => expect(isValidCategoryId("cat-industria-4-0", categories)).toBe(false));
});

describe("filterValidTagIds", () => {
  const validTags = [{ id: "tag-a", name: "A" }, { id: "tag-b", name: "B" }];
  it("mantém apenas ids válidos e reporta os rejeitados", () => {
    const result = filterValidTagIds(["tag-a", "tag-inventada"], validTags);
    expect(result.valid).toEqual(["tag-a"]);
    expect(result.rejected).toEqual(["tag-inventada"]);
  });
  it("lista vazia é válida", () => expect(filterValidTagIds([], validTags)).toEqual({ valid: [], rejected: [] }));
});

describe("filterValidCompanies", () => {
  const validHubs = [{ name: "WEG" }, { name: "Gerdau" }];
  it("mantém apenas nomes exatos válidos", () => {
    const result = filterValidCompanies(["WEG", "BYD"], validHubs);
    expect(result.valid).toEqual(["WEG"]);
    expect(result.rejected).toEqual(["BYD"]);
  });
  it("lista vazia é válida", () => expect(filterValidCompanies([], validHubs)).toEqual({ valid: [], rejected: [] }));
});

describe("loadValidSegments — fonte canônica real (Fase 8B)", () => {
  it("carrega segmentos de operationsRepository.listSegments() (segments.json via admin), não do array estático de content.ts", async () => {
    listSegmentsMock.mockResolvedValue([
      { id: "segment-metalurgia", name: "Metalurgia", slug: "metalurgia", articleCount: 12, order: 1, extraField: "ignorar" },
    ]);
    const segments = await loadValidSegments();
    expect(segments).toEqual([{ slug: "metalurgia", name: "Metalurgia" }]);
    expect(listSegmentsMock).toHaveBeenCalledTimes(1);
  });
});

describe("filterValidSegmentSlugs", () => {
  const validSegments = [
    { slug: "metalurgia", name: "Metalurgia" },
    { slug: "textil", name: "Têxtil" },
  ];
  it("mantém apenas slugs válidos e reporta os inventados", () => {
    const result = filterValidSegmentSlugs(["metalurgia", "segmento-inventado"], validSegments);
    expect(result.valid).toEqual(["metalurgia"]);
    expect(result.rejected).toEqual(["segmento-inventado"]);
  });
  it("lista vazia é válida (nenhum setor central ao fato)", () => {
    expect(filterValidSegmentSlugs([], validSegments)).toEqual({ valid: [], rejected: [] });
  });
  it("permite múltiplos segmentos centrais válidos", () => {
    const result = filterValidSegmentSlugs(["metalurgia", "textil"], validSegments);
    expect(result.valid).toEqual(["metalurgia", "textil"]);
    expect(result.rejected).toEqual([]);
  });
  it("remove slugs duplicados sem tratá-los como rejeitados", () => {
    const result = filterValidSegmentSlugs(["metalurgia", "metalurgia"], validSegments);
    expect(result.valid).toEqual(["metalurgia"]);
    expect(result.rejected).toEqual([]);
  });
  it("slug inventado nunca é aceito mesmo entre válidos", () => {
    const result = filterValidSegmentSlugs(["metalurgia", "setor-fantasma", "textil"], validSegments);
    expect(result.valid).toEqual(["metalurgia", "textil"]);
    expect(result.rejected).toEqual(["setor-fantasma"]);
  });
});
