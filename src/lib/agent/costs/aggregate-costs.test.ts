import { describe, expect, it } from "vitest";
import { averageCost, averageCostForRuns, costByRunId, groupCostsByProvider, projectMonthlyCost, publicationRate, sumCosts } from "./aggregate-costs";
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
    success: true,
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

describe("costByRunId", () => {
  it("soma múltiplas linhas do mesmo run_id (ex: Drafter + InternalAuditor com retries)", () => {
    const totals = costByRunId([
      row({ runId: "run-a", costStatus: "confirmed", estimatedCost: 0.01 }),
      row({ runId: "run-a", costStatus: "confirmed", estimatedCost: 0.02 }),
      row({ runId: "run-b", costStatus: "estimated", estimatedCost: 0.05 }),
    ]);
    expect(totals.get("run-a")).toBeCloseTo(0.03, 6);
    expect(totals.get("run-b")).toBeCloseTo(0.05, 6);
  });

  it("ignora linhas unavailable e sem runId", () => {
    const totals = costByRunId([row({ runId: "run-a", costStatus: "unavailable", estimatedCost: undefined }), row({ runId: undefined })]);
    expect(totals.has("run-a")).toBe(false);
    expect(totals.size).toBe(0);
  });
});

describe("averageCostForRuns", () => {
  it("calcula média incluindo runs sem nenhuma linha de custo como 0 (não ignora)", () => {
    const costByRun = new Map([["run-a", 0.1]]);
    expect(averageCostForRuns(["run-a", "run-b"], costByRun)).toBeCloseTo(0.05, 6);
  });

  it("retorna undefined para lista vazia de runs", () => {
    expect(averageCostForRuns([], new Map())).toBeUndefined();
  });
});

describe("groupCostsByProvider", () => {
  it("agrupa por provider, soma confirmed/estimated separadamente e conta falhas", () => {
    const result = groupCostsByProvider([
      row({ provider: "openai", costStatus: "confirmed", estimatedCost: 0.01, success: true }),
      row({ provider: "openai", costStatus: "confirmed", estimatedCost: 0.02, success: false }),
      row({ provider: "gnews", costStatus: "unavailable", estimatedCost: undefined, success: true }),
    ]);
    const openai = result.find((r) => r.provider === "openai");
    expect(openai?.confirmedTotal).toBeCloseTo(0.03, 6);
    expect(openai?.callCount).toBe(2);
    expect(openai?.failureCount).toBe(1);
    const gnews = result.find((r) => r.provider === "gnews");
    expect(gnews?.unavailableCount).toBe(1);
  });

  it("ordena do maior para o menor gasto total", () => {
    const result = groupCostsByProvider([
      row({ provider: "gnews", costStatus: "confirmed", estimatedCost: 1 }),
      row({ provider: "openai", costStatus: "confirmed", estimatedCost: 10 }),
    ]);
    expect(result.map((r) => r.provider)).toEqual(["openai", "gnews"]);
  });
});
