import { describe, expect, it } from "vitest";
import { assessSourceOgRelevance } from "./relevance";

describe("assessSourceOgRelevance", () => {
  it("aprova por padrão quando não há sinal negativo (incerteza != reprovação)", () => {
    const result = assessSourceOgRelevance("https://example.com/materia/foto-2026-industria.jpg", undefined);
    expect(result.relevant).toBe(true);
  });

  it("rejeita quando a URL indica asset genérico do site (logo)", () => {
    const result = assessSourceOgRelevance("https://example.com/assets/logo-site.jpg", undefined);
    expect(result).toEqual({ relevant: false, reason: "relevance_unverified" });
  });

  it("rejeita quando a URL indica placeholder/capa padrão", () => {
    const result = assessSourceOgRelevance("https://example.com/img/og-default.png", undefined);
    expect(result.relevant).toBe(false);
  });

  it("rejeita quando og:image:alt é genérico ('logo', 'imagem padrão')", () => {
    const result = assessSourceOgRelevance("https://example.com/foto.jpg", "Logo");
    expect(result).toEqual({ relevant: false, reason: "relevance_unverified" });
  });

  it("aprova quando og:image:alt descreve o conteúdo real da matéria", () => {
    const result = assessSourceOgRelevance("https://example.com/foto.jpg", "Trabalhadores na linha de produção da fábrica");
    expect(result.relevant).toBe(true);
  });
});
