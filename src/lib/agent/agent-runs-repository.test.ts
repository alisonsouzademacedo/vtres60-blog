import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateMock = vi.fn();
const selectOrderLimitMock = vi.fn();
const eqMock = vi.fn();

function chain() {
  return {
    insert: (...a: unknown[]) => {
      insertMock(...a);
      return {
        select: () => ({
          single: async () => ({ data: { id: "run-1", created_at: "2026-07-13T08:00:00.000Z" }, error: null }),
        }),
      };
    },
    update: (...a: unknown[]) => {
      updateMock(...a);
      return { eq: (...b: unknown[]) => eqMock(...b) };
    },
    select: () => ({
      order: () => ({
        limit: async (...a: unknown[]) => selectOrderLimitMock(...a),
      }),
    }),
  };
}

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => chain() } }));

import { createRun, finishRun, listRecentRuns } from "./agent-runs-repository";

beforeEach(() => {
  insertMock.mockReset();
  updateMock.mockReset();
  selectOrderLimitMock.mockReset();
  eqMock.mockReset();
  eqMock.mockResolvedValue({ error: null });
  selectOrderLimitMock.mockResolvedValue({ data: [], error: null });
});

describe("agent-runs-repository", () => {
  it("createRun insere status=running e trigger_type informado", async () => {
    const run = await createRun({ triggerType: "cron", scheduledFor: "2026-07-13T08:00:00.000Z" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ trigger_type: "cron", scheduled_for: "2026-07-13T08:00:00.000Z", status: "running" }),
    );
    expect(run.id).toBe("run-1");
  });

  it("finishRun envia patch em snake_case com finished_at e duration_ms", async () => {
    await finishRun("run-1", {
      status: "rejected",
      terminalReason: "not_newsworthy",
      candidateTitle: "Título X",
      candidateUrl: "https://exemplo.com/x",
      candidatesTried: 2,
      exactDedupeStatus: "unique",
      newsworthinessStatus: "not_newsworthy",
      durationMs: 1234,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "rejected",
        terminal_reason: "not_newsworthy",
        candidate_title: "Título X",
        candidate_url: "https://exemplo.com/x",
        candidates_tried: 2,
        exact_dedupe_status: "unique",
        newsworthiness_status: "not_newsworthy",
        duration_ms: 1234,
      }),
    );
    expect(updateMock.mock.calls[0][0]).toHaveProperty("finished_at");
    expect(eqMock).toHaveBeenCalledWith("id", "run-1");
  });

  it("listRecentRuns mapeia snake_case do banco para camelCase", async () => {
    selectOrderLimitMock.mockResolvedValue({
      data: [
        {
          id: "run-2",
          trigger_type: "cron",
          scheduled_for: "2026-07-13T08:00:00.000Z",
          started_at: "2026-07-13T08:00:00.000Z",
          finished_at: "2026-07-13T08:00:05.000Z",
          duration_ms: 5000,
          status: "rejected",
          terminal_reason: "not_newsworthy",
          candidate_title: "Título Y",
          candidate_url: "https://exemplo.com/y",
          candidates_tried: 1,
          source_name: "exemplo.com",
          exact_dedupe_status: "unique",
          newsworthiness_status: "not_newsworthy",
          draft_attempts: null,
          audit_status: null,
          semantic_dedupe_status: null,
          material_update_reason: null,
          image_tier: null,
          image_status: null,
          published_post_id: null,
          provider_errors: null,
          created_at: "2026-07-13T08:00:00.000Z",
        },
      ],
      error: null,
    });

    const runs = await listRecentRuns(10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: "run-2",
      triggerType: "cron",
      status: "rejected",
      terminalReason: "not_newsworthy",
      candidateTitle: "Título Y",
      candidatesTried: 1,
    });
  });
});
