import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const selectChain = { gte: vi.fn(), order: vi.fn(), limit: vi.fn() };
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (...a: unknown[]) => insertMock(...a),
      select: () => ({
        gte: (...a: unknown[]) => {
          selectChain.gte(...a);
          return {
            order: (...b: unknown[]) => {
              selectChain.order(...b);
              return { limit: (...c: unknown[]) => selectChain.limit(...c) };
            },
          };
        },
      }),
    }),
  },
}));

import { listUsageSince, recordProviderUsage } from "./usage-repository";

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  selectChain.gte.mockReset();
  selectChain.order.mockReset();
  selectChain.limit.mockReset();
  selectChain.limit.mockResolvedValue({ data: [], error: null });
});

describe("recordProviderUsage", () => {
  it("insere snake_case com defaults null para campos opcionais ausentes", async () => {
    await recordProviderUsage({
      provider: "openai",
      operation: "draft_generation",
      startedAt: "2026-07-14T10:00:00.000Z",
      costStatus: "confirmed",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        operation: "draft_generation",
        started_at: "2026-07-14T10:00:00.000Z",
        cost_status: "confirmed",
        run_id: null,
        model: null,
        model_returned: null,
        estimated_cost: null,
        finish_reason: null,
        retry_count: null,
        attempt_number: null,
        success: true,
        error_code: null,
        error_message: null,
      }),
    );
  });

  it("lança erro quando o insert falha (não engole silenciosamente)", async () => {
    insertMock.mockResolvedValue({ error: { message: "relation does not exist" } });
    await expect(
      recordProviderUsage({ provider: "openai", operation: "draft_generation", startedAt: "2026-07-14T10:00:00.000Z", costStatus: "confirmed" }),
    ).rejects.toThrow("relation does not exist");
  });
});

describe("listUsageSince", () => {
  it("filtra por created_at >= sinceIso e mapeia snake_case para camelCase", async () => {
    selectChain.limit.mockResolvedValue({
      data: [
        {
          id: "usage-1",
          run_id: "run-1",
          provider: "openai",
          operation: "draft_generation",
          model: "gpt-4o",
          model_returned: "gpt-4o-2024-08-06",
          estimated_cost: 0.0075,
          cost_status: "confirmed",
          duration_ms: 1200,
          finish_reason: "stop",
          attempt_number: 1,
          success: true,
          error_code: null,
          error_message: null,
          published_post_id: null,
          created_at: "2026-07-14T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const rows = await listUsageSince("2026-07-07T00:00:00.000Z");
    expect(selectChain.gte).toHaveBeenCalledWith("created_at", "2026-07-07T00:00:00.000Z");
    expect(rows).toEqual([
      {
        id: "usage-1",
        runId: "run-1",
        provider: "openai",
        operation: "draft_generation",
        model: "gpt-4o",
        modelReturned: "gpt-4o-2024-08-06",
        estimatedCost: 0.0075,
        costStatus: "confirmed",
        durationMs: 1200,
        finishReason: "stop",
        attemptNumber: 1,
        success: true,
        errorCode: undefined,
        errorMessage: undefined,
        publishedPostId: undefined,
        createdAt: "2026-07-14T10:00:00.000Z",
      },
    ]);
  });
});
