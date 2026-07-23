import { describe, expect, it, vi } from "vitest";
// agent-run-outcome.ts importa normalizeError de costs/record-llm-usage.ts,
// que por sua vez importa costs/usage-repository.ts (createClient real do
// Supabase) so por causa de outro export daquele modulo — mockado aqui
// pelo mesmo motivo de drafter.test.ts (evita a cadeia de import derrubar
// o teste), mesmo essa suite nunca chamando recordProviderUsage.
vi.mock("./costs/usage-repository", () => ({ recordProviderUsage: vi.fn() }));
// Fase 9B.0 — mesmo mock minimo do circuit breaker, ver drafter.test.ts.
vi.mock("./budget/circuit-breaker", () => ({
  checkAndReserveBudget: vi.fn().mockResolvedValue({ allowed: true, mode: "DISABLED" }),
  reconcileBudget: vi.fn(),
  releaseBudget: vi.fn(),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));
import type { AgentState } from "./state";
import { deriveRunOutcome } from "./agent-run-outcome";

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    sourceUrl: undefined,
    sourceText: "",
    draftText: "",
    finalPost: undefined,
    imageKeyword: "",
    imageResult: undefined,
    ogImage: undefined,
    ogImageAlt: undefined,
    companyDomain: undefined,
    companyLogoUrl: undefined,
    currentStep: "",
    auditApproved: false,
    auditFeedback: undefined,
    draftAttempts: 0,
    publishedPostId: undefined,
    autoPublish: false,
    queueItemId: undefined,
    dedupeStatus: undefined,
    exactDuplicatePostId: undefined,
    materialUpdateReason: undefined,
    relatedPostId: undefined,
    isNewsworthy: false,
    newsworthinessReason: undefined,
    eventDateOrPeriod: undefined,
    candidateQueue: [],
    candidateExhausted: false,
    candidatesTried: 1,
    candidateTitle: undefined,
    ...overrides,
  } as AgentState;
}

describe("deriveRunOutcome", () => {
  it("erro lançado => failed/operational_error, mesmo com state parcial", () => {
    const result = deriveRunOutcome(baseState({ sourceUrl: "https://exemplo.com/a" }), new Error("timeout"));
    expect(result.status).toBe("failed");
    expect(result.terminalReason).toBe("operational_error");
  });

  it("erro lançado => errorCode/errorSummary normalizados e populados (Fase 7, Secao 18)", () => {
    const result = deriveRunOutcome(baseState({}), new Error("Supabase indisponível"));
    expect(result.errorCode).toBe("Error");
    expect(result.errorSummary).toBe("Supabase indisponível");
  });

  it("erro não-Error lançado => errorCode/errorSummary nunca inventam detalhe", () => {
    const result = deriveRunOutcome(baseState({}), "algo lançado como string");
    expect(result.errorCode).toBe("UnknownError");
    expect(typeof result.errorSummary).toBe("string");
  });

  it("sem erro => errorCode/errorSummary ausentes", () => {
    const result = deriveRunOutcome(baseState({ sourceUrl: "https://exemplo.com/a" }), undefined);
    expect(result.errorCode).toBeUndefined();
    expect(result.errorSummary).toBeUndefined();
  });

  it("nenhuma candidata encontrada pelo NewsFetcher => rejected/no_candidate", () => {
    const result = deriveRunOutcome(baseState(), undefined);
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("no_candidate");
  });

  it("exact_duplicate no ExactDedupeGate => rejected/exact_duplicate", () => {
    const result = deriveRunOutcome(
      baseState({ sourceUrl: "https://exemplo.com/a", dedupeStatus: "exact_duplicate", exactDuplicatePostId: "post-1" }),
      undefined,
    );
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("exact_duplicate");
    expect(result.exactDedupeStatus).toBe("exact_duplicate");
  });

  it("not_newsworthy no NewsworthinessGate => rejected/not_newsworthy, exact_dedupe_status=unique", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        dedupeStatus: "unique",
        isNewsworthy: false,
        newsworthinessReason: "Tema genérico sem evento datável.",
      }),
      undefined,
    );
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("not_newsworthy");
    expect(result.exactDedupeStatus).toBe("unique");
    expect(result.newsworthinessStatus).toBe("not_newsworthy");
  });

  it("same_event_no_material_update no SemanticDedupeGate => rejected, exact_dedupe_status inferido unique", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        isNewsworthy: true,
        newsworthinessReason: "Evento datado.",
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "cat-1", tagIds: [], companies: [], segmentSlugs: [] },
        auditApproved: true,
        dedupeStatus: "same_event_no_material_update",
        relatedPostId: "post-2",
      }),
      undefined,
    );
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("same_event_no_material_update");
    expect(result.exactDedupeStatus).toBe("unique");
    expect(result.semanticDedupeStatus).toBe("same_event_no_material_update");
    expect(result.auditStatus).toBe("approved");
  });

  it("image_pipeline_failed no ImageProcessor => rejected/image_pipeline_failed com motivo do tier", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        isNewsworthy: true,
        newsworthinessReason: "Evento datado.",
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "cat-1", tagIds: [], companies: [], segmentSlugs: [] },
        auditApproved: true,
        dedupeStatus: "unique",
        imageResult: { status: "failed", reason: "no_pexels_candidate" },
      }),
      undefined,
    );
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("image_pipeline_failed");
    expect(result.imageStatus).toBe("no_pexels_candidate");
    expect(result.imageTier).toBeUndefined();
  });

  it("classification_failed no Publisher (categoryId inválido) => rejected, sem publishedPostId", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        isNewsworthy: true,
        newsworthinessReason: "Evento datado.",
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "", tagIds: [], companies: [], segmentSlugs: [] },
        auditApproved: false,
        draftAttempts: 5,
        dedupeStatus: "unique",
        imageResult: { status: "success", finalImageUrl: "https://x/y.webp", sourceUrl: undefined, credit: undefined, origin: "pexels", hash: "h", width: 2150, height: 1000 },
        publishedPostId: undefined,
      }),
      undefined,
    );
    expect(result.status).toBe("rejected");
    expect(result.terminalReason).toBe("classification_failed");
    expect(result.publishedPostId).toBeUndefined();
  });

  it("publicado automaticamente (cron, auditoria aprovada) => published/published", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        autoPublish: true,
        auditApproved: true,
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "cat-1", tagIds: [], companies: [], segmentSlugs: [] },
        imageResult: { status: "success", finalImageUrl: "https://x/y.webp", sourceUrl: undefined, credit: undefined, origin: "source_og", hash: "h", width: 2150, height: 1000 },
        publishedPostId: "post-3",
      }),
      undefined,
    );
    expect(result.status).toBe("published");
    expect(result.terminalReason).toBe("published");
    expect(result.imageTier).toBe("source_og");
    expect(result.publishedPostId).toBe("post-3");
  });

  it("auditoria esgotou tentativas mas post foi salvo como rascunho de emergência => draft", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        autoPublish: true,
        auditApproved: false,
        draftAttempts: 5,
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "cat-1", tagIds: [], companies: [], segmentSlugs: [] },
        imageResult: { status: "success", finalImageUrl: "https://x/y.webp", sourceUrl: undefined, credit: undefined, origin: "source_og", hash: "h", width: 2150, height: 1000 },
        publishedPostId: "post-4",
      }),
      undefined,
    );
    expect(result.status).toBe("draft");
    expect(result.terminalReason).toBe("auditor_rejected_saved_as_draft");
  });

  it("fluxo manual (autoPublish=false) aprovado gera draft normal aguardando revisão", () => {
    const result = deriveRunOutcome(
      baseState({
        sourceUrl: "https://exemplo.com/a",
        autoPublish: false,
        auditApproved: true,
        finalPost: { titulo: "T", conteudo: "C", excerpt: "E", impact: "I", categoryId: "cat-1", tagIds: [], companies: [], segmentSlugs: [] },
        imageResult: { status: "success", finalImageUrl: "https://x/y.webp", sourceUrl: undefined, credit: undefined, origin: "source_og", hash: "h", width: 2150, height: 1000 },
        publishedPostId: "post-5",
      }),
      undefined,
    );
    expect(result.status).toBe("draft");
    expect(result.terminalReason).toBe("draft_pending_review");
  });

  it("candidatesTried é repassado como está no state", () => {
    const result = deriveRunOutcome(baseState({ candidatesTried: 4 }), undefined);
    expect(result.candidatesTried).toBe(4);
  });

  it("candidatesFound é repassado como está no state (Fase 7, Secao 18)", () => {
    const result = deriveRunOutcome(baseState({ candidatesFound: 10 }), undefined);
    expect(result.candidatesFound).toBe(10);
  });
});
