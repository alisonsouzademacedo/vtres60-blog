import { describe, expect, it } from "vitest";
import { calculateEstimatedBalance } from "./estimated-balance";
import type { UsageRow } from "./usage-repository";

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: "u1",
    runId: "r1",
    provider: "openai",
    operation: "draft_generation",
    model: "gpt-4o",
    estimatedCost: 1,
    costStatus: "confirmed",
    success: true,
    publishedPostId: undefined,
    createdAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("calculateEstimatedBalance", () => {
  it("subtracts confirmed+estimated consumption from the initial value", () => {
    const result = calculateEstimatedBalance({
      initialValue: 100,
      initialDate: "2026-07-01",
      currency: "USD",
      usageSinceInitialDate: [row({ costStatus: "confirmed", estimatedCost: 10 }), row({ costStatus: "estimated", estimatedCost: 5 })],
    });
    expect(result.consumedSinceInitialDate).toBeCloseTo(15, 6);
    expect(result.estimatedBalance).toBeCloseTo(85, 6);
  });

  it("ignores unavailable rows (never treats unknown cost as zero consumption)", () => {
    const result = calculateEstimatedBalance({
      initialValue: 50,
      initialDate: "2026-07-01",
      currency: "USD",
      usageSinceInitialDate: [row({ costStatus: "unavailable", estimatedCost: undefined })],
    });
    expect(result.consumedSinceInitialDate).toBe(0);
    expect(result.estimatedBalance).toBe(50);
  });

  it("returns the initial value unchanged with no usage rows", () => {
    const result = calculateEstimatedBalance({ initialValue: 20, initialDate: "2026-07-01", currency: "USD", usageSinceInitialDate: [] });
    expect(result.estimatedBalance).toBe(20);
  });

  it("can go negative when consumption exceeds the initial budget (never clamped, so overspend is visible)", () => {
    const result = calculateEstimatedBalance({
      initialValue: 10,
      initialDate: "2026-07-01",
      currency: "USD",
      usageSinceInitialDate: [row({ costStatus: "confirmed", estimatedCost: 25 })],
    });
    expect(result.estimatedBalance).toBe(-15);
  });
});
