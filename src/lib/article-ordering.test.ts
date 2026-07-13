import { describe, expect, it } from "vitest";
import { compareByRecency, resolveLeadArticle } from "./article-ordering";

interface Fixture {
  slug: string;
  createdAt: string;
  featured?: boolean;
  mainStory?: boolean;
  displayOrder?: number;
}

// Ordem de insercao deliberadamente embaralhada e sem relacao com created_at,
// para garantir que o teste dependa apenas do comparator, nao da ordem de entrada.
const old_mainStory: Fixture = { slug: "antiga-fixada", createdAt: "2026-06-27T17:42:00-03:00", featured: true, mainStory: true, displayOrder: 1 };
const mid: Fixture = { slug: "meio-termo", createdAt: "2026-07-05T08:00:00-03:00", featured: false, mainStory: false, displayOrder: 9 };
const newest: Fixture = { slug: "mais-recente", createdAt: "2026-07-09T08:00:26.085Z", featured: false, mainStory: false, displayOrder: 0 };

function sorted(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort(compareByRecency);
}

describe("compareByRecency", () => {
  it("ordena por createdAt decrescente, ignorando featured/mainStory/displayOrder", () => {
    const result = sorted([old_mainStory, newest, mid]);
    expect(result.map((a) => a.slug)).toEqual(["mais-recente", "meio-termo", "antiga-fixada"]);
  });

  it("um artigo antigo com featured=true não vence um artigo mais recente sem featured", () => {
    const result = sorted([newest, old_mainStory]);
    expect(result[0].slug).toBe("mais-recente");
  });

  it("um artigo antigo com mainStory=true não vence um artigo mais recente sem mainStory", () => {
    const result = sorted([old_mainStory, newest]);
    expect(result[0].slug).toBe("mais-recente");
  });
});

describe("resolveLeadArticle", () => {
  const articles = sorted([old_mainStory, newest, mid]); // pré-ordenado, mais-recente primeiro

  it("REGRA A: leadArticleSlug válido vence como escolha editorial explícita", () => {
    const lead = resolveLeadArticle(articles, "antiga-fixada");
    expect(lead?.slug).toBe("antiga-fixada");
  });

  it("REGRA B: leadArticleSlug vazio faz o hero usar o artigo mais recente", () => {
    const lead = resolveLeadArticle(articles, "");
    expect(lead?.slug).toBe("mais-recente");
  });

  it("leadArticleSlug inválido não quebra a seleção e cai para o artigo mais recente", () => {
    const lead = resolveLeadArticle(articles, "slug-que-nao-existe");
    expect(lead?.slug).toBe("mais-recente");
  });

  it("featured=true em artigo antigo não o mantém como hero quando leadArticleSlug está vazio", () => {
    const lead = resolveLeadArticle(articles, "");
    expect(lead?.featured).not.toBe(true);
    expect(lead?.slug).not.toBe("antiga-fixada");
  });

  it("mainStory=true em artigo antigo não o mantém como hero quando leadArticleSlug está vazio", () => {
    const lead = resolveLeadArticle(articles, "");
    expect(lead?.mainStory).not.toBe(true);
    expect(lead?.slug).not.toBe("antiga-fixada");
  });

  it("não retorna nada para uma lista vazia", () => {
    expect(resolveLeadArticle([], "qualquer-slug")).toBeUndefined();
  });
});
