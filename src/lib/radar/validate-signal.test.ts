import { describe, expect, it } from "vitest";
import { validateRadarSignalPublication } from "./validate-signal";

const CONTEXT = {
  postIds: new Set(["post-1", "post-2"]),
  tagIds: new Set(["tag-ia"]),
  segmentSlugs: new Set(["metalurgia"]),
  companySlugs: new Set(["weg"]),
};

const BASE = {
  title: "Sinal real", summary: "Resumo real",
  evidencePostIds: ["post-1"], sourceUrls: ["https://exemplo.com/noticia"],
  tagIds: ["tag-ia"], segmentSlugs: ["metalurgia"], companySlugs: ["weg"],
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  reviewedAt: new Date().toISOString(),
  status: "published" as const,
};

describe("validateRadarSignalPublication", () => {
  it("aceita publicação com evidência real, revisada e ainda válida", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "reviewed" }, CONTEXT);
    expect(errors).toEqual([]);
  });

  it("rejeita publicação sem nenhuma evidência (evidencePostIds vazio)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, evidencePostIds: [], sourceUrls: [] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita post inexistente como evidência", () => {
    const errors = validateRadarSignalPublication({ ...BASE, evidencePostIds: ["post-inexistente"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita tag inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, tagIds: ["tag-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "tagIds")).toBe(true);
  });

  it("rejeita segmento inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, segmentSlugs: ["segmento-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "segmentSlugs")).toBe(true);
  });

  it("rejeita empresa inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, companySlugs: ["empresa-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "companySlugs")).toBe(true);
  });

  it("rejeita sinal já expirado (validUntil no passado)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, validUntil: new Date(Date.now() - 1000).toISOString() }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "validUntil")).toBe(true);
  });

  it("rejeita publicação direta de um draft (sem revisão prévia)", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "draft" }, CONTEXT);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("rejeita publicação sem reviewedAt mesmo saindo de status reviewed", () => {
    const errors = validateRadarSignalPublication({ ...BASE, reviewedAt: undefined }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "reviewedAt")).toBe(true);
  });

  it("republicar (published -> published) é aceito quando tudo continua válido", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "published" }, CONTEXT);
    expect(errors).toEqual([]);
  });

  it("não valida nada quando o status alvo não é 'published' (ex.: salvar como rascunho)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, status: "draft", evidencePostIds: [], sourceUrls: [] }, { status: "draft" }, CONTEXT);
    expect(errors).toEqual([]);
  });
});
