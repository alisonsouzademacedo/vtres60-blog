import { describe, expect, it } from "vitest";
import { classifyBackfillRow, SegmentBackfillSchema } from "./backfill-segmentos";

describe("classifyBackfillRow — decisão pura do preview de backfill (Fase 8B)", () => {
  it("NO_SEGMENT quando nenhum slug válido sobra após o filtro", () => {
    expect(classifyBackfillRow({ valid: [], rejected: [] }, "alta")).toBe("NO_SEGMENT");
  });

  it("NO_SEGMENT mesmo com confiança alta, se o filtro zerou tudo (slug inventado)", () => {
    expect(classifyBackfillRow({ valid: [], rejected: ["setor-fantasma"] }, "alta")).toBe("NO_SEGMENT");
  });

  it("HIGH_CONFIDENCE quando há slugs válidos, confiança alta e nenhum descarte", () => {
    expect(classifyBackfillRow({ valid: ["metalurgia"], rejected: [] }, "alta")).toBe("HIGH_CONFIDENCE");
  });

  it("AMBIGUOUS quando há slugs válidos mas a confiança reportada é ambígua", () => {
    expect(classifyBackfillRow({ valid: ["metalurgia"], rejected: [] }, "ambigua")).toBe("AMBIGUOUS");
  });

  it("AMBIGUOUS quando há slugs válidos com confiança alta, mas também houve descarte de slug inventado", () => {
    expect(classifyBackfillRow({ valid: ["metalurgia"], rejected: ["setor-fantasma"] }, "alta")).toBe("AMBIGUOUS");
  });
});

describe("SegmentBackfillSchema", () => {
  it("aceita segmentSlugs vazio com confidence e justification", () => {
    const result = SegmentBackfillSchema.safeParse({ segmentSlugs: [], confidence: "alta", justification: "Nenhum setor central." });
    expect(result.success).toBe(true);
  });

  it("rejeita confidence fora do enum", () => {
    const result = SegmentBackfillSchema.safeParse({ segmentSlugs: [], confidence: "media", justification: "x" });
    expect(result.success).toBe(false);
  });

  it("rejeita quando justification está ausente", () => {
    const withoutJustification: Record<string, unknown> = { segmentSlugs: ["metalurgia"], confidence: "alta" };
    expect(SegmentBackfillSchema.safeParse(withoutJustification).success).toBe(false);
  });
});
