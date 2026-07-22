import { describe, expect, it } from "vitest";
import { validateIntelligencePublication } from "./validate-intelligence";

const CONTEXT = {
  postIds: new Set(["post-1"]),
  tagIds: new Set<string>(),
  segmentSlugs: new Set(["metalurgia"]),
  companySlugs: new Set(["weg"]),
};

const REAL_SIGNALS = new Set(["signal-1"]);

const BASE = {
  radarSignalId: "signal-1", kind: "analysis" as const,
  title: "Análise real", analysis: "Texto de análise real", recommendedAction: undefined,
  evidencePostIds: ["post-1"], sourceUrls: ["https://exemplo.com/noticia"],
  segmentSlugs: ["metalurgia"], companySlugs: ["weg"],
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  reviewedAt: new Date().toISOString(),
  status: "published" as const,
};

describe("validateIntelligencePublication", () => {
  it("aceita publicação de 'analysis' com radar_signal_id real e evidência válida", () => {
    expect(validateIntelligencePublication(BASE, { status: "reviewed" }, CONTEXT, REAL_SIGNALS)).toEqual([]);
  });

  it("rejeita quando radar_signal_id não existe", () => {
    const errors = validateIntelligencePublication({ ...BASE, radarSignalId: "signal-fantasma" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "radarSignalId")).toBe(true);
  });

  it("rejeita 'recommendation' sem recommendedAction preenchido", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "recommendation", recommendedAction: undefined }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "recommendedAction")).toBe(true);
  });

  it("aceita 'recommendation' com recommendedAction preenchido", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "recommendation", recommendedAction: "Ação recomendada real" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors).toEqual([]);
  });

  it("'fact' não exige recommendedAction", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "fact" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors).toEqual([]);
  });

  it("rejeita sem nenhuma evidência", () => {
    const errors = validateIntelligencePublication({ ...BASE, evidencePostIds: [], sourceUrls: [] }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita publicação direta de um draft", () => {
    const errors = validateIntelligencePublication(BASE, { status: "draft" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("rejeita item já expirado", () => {
    const errors = validateIntelligencePublication({ ...BASE, validUntil: new Date(Date.now() - 1000).toISOString() }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "validUntil")).toBe(true);
  });
});
