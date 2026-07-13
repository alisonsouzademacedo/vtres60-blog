import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("noticias/[slug]/page.tsx — bloco \"O que isso muda para a indústria\" (Fase 2)", () => {
  const source = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

  it("renderiza o bloco de impact condicionalmente (impact vazio → bloco omitido, sem placeholder)", () => {
    expect(source).toMatch(/\{article\.impact&&<div id="impacto"/);
    expect(source).not.toMatch(/Análise em atualização/i);
  });

  it("o link de âncora \"Impacto na indústria\" também é condicional ao impact existir", () => {
    expect(source).toMatch(/\{article\.impact&&<a href="#impacto">/);
  });

  it("mantém o CTA (\"Próxima decisão\") como bloco separado, vindo de article.cta — não do body", () => {
    expect(source).toMatch(/\{article\.cta&&<div id="decisao"/);
    expect(source).toMatch(/PRÓXIMA DECISÃO/);
  });
});
