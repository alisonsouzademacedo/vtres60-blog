import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("article-card.tsx — excerpt completo, sem truncamento em JS (Fase 2)", () => {
  const source = readFileSync(path.join(__dirname, "article-card.tsx"), "utf8");

  it("renderiza article.excerpt diretamente, sem slice/substring", () => {
    expect(source).toMatch(/\{article\.excerpt\}/);
    expect(source).not.toMatch(/excerpt\.slice/);
    expect(source).not.toMatch(/excerpt\.substring/);
  });

  it("não concatena reticências (\"...\" ou \"…\") em nenhum lugar do componente", () => {
    expect(source).not.toMatch(/\.\.\./);
    expect(source).not.toMatch(/…/);
  });

  it("não referencia article.impact (cards mostram resumo, não análise)", () => {
    expect(source).not.toMatch(/article\.impact/);
  });
});
