import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Teste de caracterização (sem renderizar React — o projeto não tem
// jsdom/testing-library instalado, e o componente importa CSS Modules).
// Verifica no código-fonte que: (1) o bloco de impact só renderiza quando
// impact existe, (2) resolveLeadArticle/article-ordering continuam sendo
// usados para resolver o destaque.
describe("featured-news.tsx — bloco de impact e resolução do lead (Fase 2)", () => {
  const source = readFileSync(path.join(__dirname, "featured-news.tsx"), "utf8");

  it("renderiza o bloco de impact condicionalmente (impact vazio → nada renderizado)", () => {
    expect(source).toMatch(/\{lead\.impact&&<div className=\{styles\.impact\}>/);
  });

  it("não concatena reticências (\"...\" ou \"…\") em nenhum lugar do componente", () => {
    // Verifica reticencias como literal de string, nao o operador spread
    // (`...configuredSides`) que e sintaxe JS legitima e nao tem relacao
    // com truncamento visual de texto.
    expect(source).not.toMatch(/["'`]\.\.\.["'`]/);
    expect(source).not.toMatch(/…/);
  });

  it("continua usando resolveLeadArticle (Fase 1) para escolher o artigo em destaque", () => {
    expect(source).toMatch(/import \{ resolveLeadArticle \} from "@\/lib\/article-ordering"/);
    expect(source).toMatch(/resolveLeadArticle\(articles,\s*config\.leadArticleSlug\)/);
  });
});
