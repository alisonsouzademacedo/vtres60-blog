import { describe, expect, it, vi } from "vitest";

// DraftSchema em si nao depende de Supabase, mas o modulo drafter.ts
// importa taxonomies.ts (para o taxonomy block do prompt), que por sua vez
// importa @/services/editorial -> @/lib/supabase (cria o client no
// carregamento do modulo, exigindo env vars). Mock minimo so para permitir
// importar o modulo em teste — estes testes exercitam apenas o schema.
vi.mock("@/services/editorial", () => ({
  editorialRepository: { listCategories: vi.fn(), listTags: vi.fn() },
}));
vi.mock("@/services/operations", () => ({
  operationsRepository: { listSegments: vi.fn().mockResolvedValue([]) },
}));
// drafter.ts tambem importa costs/usage-repository.ts (Fase 6, captura de
// custo real do Drafter), que por sua vez importa @/lib/supabase (cria um
// client real no carregamento do modulo, exigindo env vars) — mock minimo
// pelo mesmo motivo do mock de editorial acima: so para permitir importar
// o modulo em teste, sem exercitar a chamada de fato.
vi.mock("@/lib/agent/costs/usage-repository", () => ({ recordProviderUsage: vi.fn() }));
// Fase 9B.0 — costs/record-llm-usage.ts (importado transitivamente por
// drafter.ts) agora importa budget/circuit-breaker.ts, que tambem importa
// @/lib/supabase — mesmo mock minimo pelo mesmo motivo dos acima.
vi.mock("@/lib/agent/budget/circuit-breaker", () => ({
  checkAndReserveBudget: vi.fn().mockResolvedValue({ allowed: true, mode: "DISABLED" }),
  reconcileBudget: vi.fn(),
  releaseBudget: vi.fn(),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

import { DraftSchema } from "./drafter";

const validDraft = {
  titulo: "Título de teste",
  conteudo: "Primeiro parágrafo.\n\nSegundo parágrafo.",
  excerpt: "Resumo curto do fato central.",
  impact: "O movimento pode reforçar a necessidade de observar o setor.",
  imageKeyword: "factory, industry, robot",
  companyDomain: null,
  categoryId: "cat-teste",
  tagIds: ["tag-teste"],
  companies: ["WEG"],
  segmentSlugs: ["metalurgia"],
};

describe("DraftSchema (Fase 2)", () => {
  it("aceita um draft completo com excerpt e impact", () => {
    expect(DraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("exige excerpt — rejeita quando ausente", () => {
    const withoutExcerpt: Record<string, unknown> = { ...validDraft };
    delete withoutExcerpt.excerpt;
    expect(DraftSchema.safeParse(withoutExcerpt).success).toBe(false);
  });

  it("exige impact — rejeita quando ausente", () => {
    const withoutImpact: Record<string, unknown> = { ...validDraft };
    delete withoutImpact.impact;
    expect(DraftSchema.safeParse(withoutImpact).success).toBe(false);
  });

  it("rejeita excerpt com tipo errado (não-string)", () => {
    expect(DraftSchema.safeParse({ ...validDraft, excerpt: 123 }).success).toBe(false);
  });

  it("rejeita impact com tipo errado (não-string)", () => {
    expect(DraftSchema.safeParse({ ...validDraft, impact: null }).success).toBe(false);
  });

  it("continua aceitando titulo/conteudo/imageKeyword/companyDomain (campos pré-existentes)", () => {
    const result = DraftSchema.safeParse(validDraft);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.titulo).toBe(validDraft.titulo);
      expect(result.data.conteudo).toBe(validDraft.conteudo);
      expect(result.data.imageKeyword).toBe(validDraft.imageKeyword);
      expect(result.data.companyDomain).toBeNull();
    }
  });
});

describe("DraftSchema — categoryId/tagIds/companies (Fase 3)", () => {
  it("exige categoryId — rejeita quando ausente", () => {
    const withoutCategory: Record<string, unknown> = { ...validDraft };
    delete withoutCategory.categoryId;
    expect(DraftSchema.safeParse(withoutCategory).success).toBe(false);
  });

  it("categoryId com tipo errado (não-string) é rejeitado pelo schema", () => {
    expect(DraftSchema.safeParse({ ...validDraft, categoryId: 123 }).success).toBe(false);
  });

  it("aceita tagIds como lista vazia", () => {
    expect(DraftSchema.safeParse({ ...validDraft, tagIds: [] }).success).toBe(true);
  });

  it("aceita companies como lista vazia", () => {
    expect(DraftSchema.safeParse({ ...validDraft, companies: [] }).success).toBe(true);
  });

  it("rejeita tagIds que não seja array de strings", () => {
    expect(DraftSchema.safeParse({ ...validDraft, tagIds: "tag-teste" }).success).toBe(false);
  });

  it("rejeita companies que não seja array de strings", () => {
    expect(DraftSchema.safeParse({ ...validDraft, companies: "WEG" }).success).toBe(false);
  });

  it("aceita segmentSlugs como lista vazia (nenhum setor central)", () => {
    expect(DraftSchema.safeParse({ ...validDraft, segmentSlugs: [] }).success).toBe(true);
  });

  it("aceita segmentSlugs com múltiplos slugs", () => {
    const result = DraftSchema.safeParse({ ...validDraft, segmentSlugs: ["metalurgia", "textil"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.segmentSlugs).toEqual(["metalurgia", "textil"]);
  });

  it("exige segmentSlugs — rejeita quando ausente", () => {
    const withoutSegments: Record<string, unknown> = { ...validDraft };
    delete withoutSegments.segmentSlugs;
    expect(DraftSchema.safeParse(withoutSegments).success).toBe(false);
  });

  it("rejeita segmentSlugs que não seja array de strings", () => {
    expect(DraftSchema.safeParse({ ...validDraft, segmentSlugs: "metalurgia" }).success).toBe(false);
  });

  it("é o único DraftSchema do módulo — não há um schema V2/V3 paralelo", () => {
    expect(Object.keys(DraftSchema.shape).sort()).toEqual(
      ["titulo", "conteudo", "excerpt", "impact", "imageKeyword", "companyDomain", "categoryId", "tagIds", "companies", "segmentSlugs"].sort(),
    );
  });

  it("não renomeou titulo/conteudo para title/body", () => {
    const keys = Object.keys(DraftSchema.shape);
    expect(keys).toContain("titulo");
    expect(keys).toContain("conteudo");
    expect(keys).not.toContain("title");
    expect(keys).not.toContain("body");
  });
});
