import { beforeEach, describe, expect, it, vi } from "vitest";

// usage-repository.ts importa @/lib/supabase (createClient real) — mock
// completo do modulo, sem importActual, para nao disparar essa cadeia em
// ambiente de teste (mesmo padrao de drafter.test.ts).
const recordProviderUsageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("./usage-repository", () => ({ recordProviderUsage: (...args: unknown[]) => recordProviderUsageMock(...args) }));

import { extractUsageMetadata, invokeWithUsageTelemetry, normalizeError } from "./record-llm-usage";

beforeEach(() => {
  recordProviderUsageMock.mockReset();
  recordProviderUsageMock.mockResolvedValue(undefined);
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
