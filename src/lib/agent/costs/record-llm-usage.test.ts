import { beforeEach, describe, expect, it, vi } from "vitest";

// usage-repository.ts importa @/lib/supabase (createClient real) — mock
// completo do modulo, sem importActual, para nao disparar essa cadeia em
// ambiente de teste (mesmo padrao de drafter.test.ts).
const recordProviderUsageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./usage-repository", () => ({ recordProviderUsage: (...args: unknown[]) => recordProviderUsageMock(...args) }));

// Fase 9B.0 — circuit-breaker.ts tambem importa @/lib/supabase (via rpc),
// mesmo mock completo, mesma razao.
const checkAndReserveBudgetMock = vi.fn();
const reconcileBudgetMock = vi.fn().mockResolvedValue(undefined);
const releaseBudgetMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../budget/circuit-breaker", () => ({
  checkAndReserveBudget: (...args: unknown[]) => checkAndReserveBudgetMock(...args),
  reconcileBudget: (...args: unknown[]) => reconcileBudgetMock(...args),
  releaseBudget: (...args: unknown[]) => releaseBudgetMock(...args),
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(
      public readonly reason: string,
      public readonly provider: string,
    ) {
      super(`Orçamento excedido para ${provider}: ${reason}`);
      this.name = "BudgetExceededError";
    }
  },
}));

import { extractUsageMetadata, invokeWithUsageTelemetry, normalizeError } from "./record-llm-usage";
import { BudgetExceededError } from "../budget/circuit-breaker";

beforeEach(() => {
  recordProviderUsageMock.mockReset();
  recordProviderUsageMock.mockResolvedValue(undefined);
  checkAndReserveBudgetMock.mockReset();
  checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-1" });
  reconcileBudgetMock.mockReset();
  reconcileBudgetMock.mockResolvedValue(undefined);
  releaseBudgetMock.mockReset();
  releaseBudgetMock.mockResolvedValue(undefined);
});

describe("extractUsageMetadata", () => {
  it("returns usage_metadata when present", () => {
    const raw = { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    expect(extractUsageMetadata(raw)).toEqual(raw.usage_metadata);
  });

  it("returns undefined when absent", () => {
    expect(extractUsageMetadata({})).toBeUndefined();
    expect(extractUsageMetadata(undefined)).toBeUndefined();
  });
});

describe("normalizeError", () => {
  it("extracts name/message from a real Error, truncated", () => {
    const error = new Error("x".repeat(600));
    const normalized = normalizeError(error);
    expect(normalized.code).toBe("Error");
    expect(normalized.message).toHaveLength(500);
  });

  it("falls back to a fixed message for non-Error throws (never invents detail)", () => {
    expect(normalizeError("some string thrown")).toEqual({ code: "UnknownError", message: expect.any(String) });
  });
});

describe("invokeWithUsageTelemetry", () => {
  it("records a confirmed usage row and returns parsed on success", async () => {
    const raw = {
      id: "chatcmpl-123",
      usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150, input_token_details: { cache_read: 10 } },
      response_metadata: { model_name: "gpt-4o-2024-08-06", finish_reason: "stop" },
    };
    const result = await invokeWithUsageTelemetry(
      { runId: "run-1", operation: "newsworthiness", modelRequested: "gpt-4o", attemptNumber: 1 },
      async () => ({ raw, parsed: { isNewsworthy: true } }),
    );
    expect(result).toEqual({ isNewsworthy: true });
    expect(recordProviderUsageMock).toHaveBeenCalledTimes(1);
    const call = recordProviderUsageMock.mock.calls[0][0];
    expect(call).toMatchObject({
      runId: "run-1",
      provider: "openai",
      operation: "newsworthiness",
      model: "gpt-4o",
      modelReturned: "gpt-4o-2024-08-06",
      requestId: "chatcmpl-123",
      finishReason: "stop",
      attemptNumber: 1,
      success: true,
    });
  });

  it("does not record usage when the provider returns no usage_metadata (never invents tokens)", async () => {
    await invokeWithUsageTelemetry({ operation: "newsworthiness", modelRequested: "gpt-4o" }, async () => ({
      raw: {},
      parsed: { ok: true },
    }));
    expect(recordProviderUsageMock).not.toHaveBeenCalled();
  });

  it("records a failed row with sanitized error and rethrows on failure", async () => {
    const boom = new Error("connection timeout after 60000ms");
    await expect(
      invokeWithUsageTelemetry({ operation: "internal_audit", modelRequested: "gpt-4o", attemptNumber: 2 }, async () => {
        throw boom;
      }),
    ).rejects.toThrow(boom);
    expect(recordProviderUsageMock).toHaveBeenCalledTimes(1);
    expect(recordProviderUsageMock.mock.calls[0][0]).toMatchObject({
      operation: "internal_audit",
      success: false,
      errorCode: "Error",
      errorMessage: "connection timeout after 60000ms",
      attemptNumber: 2,
      costStatus: "unavailable",
    });
  });

  it("never blocks the caller when telemetry write itself fails", async () => {
    recordProviderUsageMock.mockRejectedValue(new Error("relation does not exist"));
    const raw = { usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const result = await invokeWithUsageTelemetry({ operation: "newsworthiness", modelRequested: "gpt-4o" }, async () => ({
      raw,
      parsed: { ok: true },
    }));
    expect(result).toEqual({ ok: true });
  });
});

describe("invokeWithUsageTelemetry — circuit breaker de orçamento (Fase 9B.0)", () => {
  it("reserva orçamento ANTES de chamar o provider, passando o provider/operação corretos", async () => {
    const raw = { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    await invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o", runId: "run-1" }, async () => ({
      raw,
      parsed: { ok: true },
    }));
    expect(checkAndReserveBudgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", operation: "draft_generation", runId: "run-1" }),
    );
  });

  it("NÃO chama o provider quando o guard bloqueia (allowed:false) — lança BudgetExceededError", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: false, mode: "ENFORCE", reason: "daily_budget_exceeded" });
    const call = vi.fn();
    await expect(invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, call)).rejects.toThrow(
      BudgetExceededError,
    );
    expect(call).not.toHaveBeenCalled();
    expect(recordProviderUsageMock).toHaveBeenCalledTimes(1);
    expect(recordProviderUsageMock.mock.calls[0][0]).toMatchObject({
      success: false,
      errorCode: "BudgetExceededError",
      costStatus: "unavailable",
    });
  });

  it("modo DISABLED sempre permite (allowed:true) mesmo sem teto aprovado", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-2" });
    const raw = { usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    const result = await invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, async () => ({
      raw,
      parsed: { ok: true },
    }));
    expect(result).toEqual({ ok: true });
  });

  it("reconcilia a reserva com o custo REAL (não a estimativa) após sucesso", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "AUDIT", reservationId: "res-3" });
    const raw = { usage_metadata: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 } };
    await invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, async () => ({ raw, parsed: {} }));
    expect(reconcileBudgetMock).toHaveBeenCalledWith("res-3", expect.any(Number));
    const actualCost = reconcileBudgetMock.mock.calls[0][1];
    expect(actualCost).toBeGreaterThan(0);
  });

  it("libera a reserva sem custo quando a chamada ao provider falha", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "ENFORCE", reservationId: "res-4" });
    await expect(
      invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(releaseBudgetMock).toHaveBeenCalledWith("res-4");
    expect(reconcileBudgetMock).not.toHaveBeenCalled();
  });

  it("degrada aberto (allowed:true, degraded:true) quando o guard falha — nunca bloqueia por conta própria", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "ENFORCE", degraded: true, reason: "guard_unavailable" });
    const raw = { usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const result = await invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, async () => ({
      raw,
      parsed: { ok: true },
    }));
    expect(result).toEqual({ ok: true });
  });

  it("usa a estimativa histórica real por operação (draft_generation ≈ US$0,015, news_pick ≈ US$0,0021 — Fase 9A)", async () => {
    const raw = { usage_metadata: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    await invokeWithUsageTelemetry({ operation: "draft_generation", modelRequested: "gpt-4o" }, async () => ({ raw, parsed: {} }));
    expect(checkAndReserveBudgetMock).toHaveBeenLastCalledWith(expect.objectContaining({ estimatedCost: 0.015 }));

    await invokeWithUsageTelemetry({ operation: "news_pick", modelRequested: "gpt-4o" }, async () => ({ raw, parsed: {} }));
    expect(checkAndReserveBudgetMock).toHaveBeenLastCalledWith(expect.objectContaining({ estimatedCost: 0.0021 }));
  });
});
