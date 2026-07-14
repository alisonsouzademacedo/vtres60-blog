import { beforeEach, describe, expect, it, vi } from "vitest";

const listArticlesMock = vi.fn();
vi.mock("@/services/cms", () => ({ contentRepository: { listArticles: () => listArticlesMock() } }));

import type { Article } from "@/types/content";
import { hasTaxonomyMatches } from "./taxonomy-matches";

function article(overrides: Partial<Article>): Article {
  return { slug: "a", categorySlug: "outra", tags: [], segments: [], companies: [], ...overrides } as Article;
}

beforeEach(() => {
  listArticlesMock.mockReset();
});

describe("hasTaxonomyMatches (Fase 6 — fix de thin content)", () => {
  it("retorna true quando existe ao menos um artigo real que passa no filtro", async () => {
    listArticlesMock.mockResolvedValue([article({ categorySlug: "marketing-industrial" })]);
    const result = await hasTaxonomyMatches((a) => a.categorySlug === "marketing-industrial");
    expect(result).toBe(true);
  });

  it("retorna false quando nenhum artigo real passa no filtro — NÃO deve contar como match um artigo não relacionado", async () => {
    listArticlesMock.mockResolvedValue([article({ categorySlug: "outra-categoria" })]);
    const result = await hasTaxonomyMatches((a) => a.categorySlug === "marketing-industrial");
    expect(result).toBe(false);
  });

  it("retorna false quando não há nenhum artigo no site", async () => {
    listArticlesMock.mockResolvedValue([]);
    const result = await hasTaxonomyMatches(() => true);
    expect(result).toBe(false);
  });
});
