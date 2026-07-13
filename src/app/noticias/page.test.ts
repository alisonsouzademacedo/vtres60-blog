import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Teste de caracterização: garante que /noticias nunca passe a depender da
// configuração de destaque manual da home (leadArticleSlug). A ordenação
// cronológica do feed e a seleção editorial manual do hero devem permanecer
// desacopladas — ver src/lib/article-ordering.ts.
describe("/noticias — separação entre feed cronológico e destaque manual da home", () => {
  const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

  it("não importa configRepository nem HomeSettings", () => {
    expect(source).not.toMatch(/configRepository/);
    expect(source).not.toMatch(/HomeSettings/);
  });

  it("não referencia leadArticleSlug", () => {
    expect(source).not.toMatch(/leadArticleSlug/);
  });

  it("consome contentRepository.listArticles() diretamente, sem reordenar por outro critério além do array recebido", () => {
    expect(source).toMatch(/contentRepository\.listArticles\(\)/);
  });
});
