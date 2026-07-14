import { describe, expect, it } from "vitest";
import { averageCost, projectMonthlyCost, publicationRate, sumCosts } from "./aggregate-costs";
import type { UsageRow } from "./usage-repository";

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: "u1",
    runId: "r1",
    provider: "openai",
    operation: "draft_generation",
    model: "gpt-4o",
    estimatedCost: 0.01,
    costStatus: "confirmed",
    publishedPostId: undefined,
    createdAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("sumCosts", () => {
  it("soma confirmed e estimated separadamente, sem misturar", () => {
    const result = sumCosts([
      row({ costStatus: "confirmed", estimatedCost: 0.01 }),
      row({ costStatus: "confirmed", estimatedCost: 0.02 }),
      row({ costStatus: "estimated", estimatedCost: 0.003 }),
    ]);
    expect(result.confirmedTotal).toBeCloseTo(0.03, 6);
    expect(result.estimatedTotal).toBeCloseTo(0.003, 6);
    expect(result.unavailableCount).toBe(0);
  });

  it("conta unavailable sem somar ao total (não inventa custo)", () => {
    const result = sumCosts([row({ costStatus: "unavailable", estimatedCost: undefined })]);
    expect(result.confirmedTotal).toBe(0);
    expect(result.estimatedTotal).toBe(0);
    expect(result.unavailableCount).toBe(1);
  });

  it("lista vazia retorna zeros, não erro", () => {
    const result = sumCosts([]);
    expect(result).toEqual({ confirmedTotal: 0, estimatedTotal: 0, unavailableCount: 0 });
  });
});

describe("averageCost", () => {
  it("calcula média normalmente", () => {
    expect(averageCost(1, 4)).toBe(0.25);
  });

  it("retorna undefined em vez de dividir por zero", () => {
    expect(averageCost(1, 0)).toBeUndefined();
  });
});

describe("publicationRate", () => {
  it("calcula taxa de publicação", () => {
    expect(publicationRate(3, 12)).toBe(0.25);
  });

  it("retorna undefined quando não há execuções (0/0)", () => {
    expect(publicationRate(0, 0)).toBeUndefined();
  });
});

describe("projectMonthlyCost", () => {
  it("projeta gasto mensal a partir da média diária de uma janela", () => {
    // 7 dias custando 0.70 total => média diária 0.10 => mês (30d) = 3.00
    expect(projectMonthlyCost(0.7, 7)).toBeCloseTo(3.0, 6);
  });

  it("retorna undefined quando windowDays <= 0 (nunca divide por zero)", () => {
    expect(projectMonthlyCost(1, 0)).toBeUndefined();
  });
});
