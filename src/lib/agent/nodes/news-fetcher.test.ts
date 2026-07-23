import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a), isAxiosError: () => false } }));
const invokeMock = vi.fn();
vi.mock("../llm", () => ({ llm: { withStructuredOutput: () => ({ invoke: invokeMock }) } }));
// Fase 7 — news-fetcher.ts agora grava telemetria (GNews + escolha via LLM)
// e por isso precisa de `state.runId`; usage-repository.ts importa
// @/lib/supabase (createClient real), mockado aqui pelo mesmo motivo do
// drafter.test.ts (evita a cadeia de import derrubar o teste).
const recordProviderUsageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../costs/usage-repository", () => ({ recordProviderUsage: (...a: unknown[]) => recordProviderUsageMock(...a) }));

// Fase 9B.0 — searchGNews (este arquivo) e invokeWithUsageTelemetry
// (chamado internamente pelo bloco de escolha via LLM) ambos importam o
// circuit breaker, que por sua vez importa @/lib/supabase — mesmo mock
// completo, mesma razao dos outros dois acima.
const checkAndReserveBudgetMock = vi.fn().mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-1" });
const reconcileBudgetMock = vi.fn().mockResolvedValue(undefined);
const releaseBudgetMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../budget/circuit-breaker", () => ({
  checkAndReserveBudget: (...a: unknown[]) => checkAndReserveBudgetMock(...a),
  reconcileBudget: (...a: unknown[]) => reconcileBudgetMock(...a),
  releaseBudget: (...a: unknown[]) => releaseBudgetMock(...a),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

import { newsFetcherNode } from "./news-fetcher";
import type { AgentState } from "../state";

const baseState = { runId: "run-1" } as AgentState;

const articles = [
  { title: "Notícia A", description: "Desc A", url: "https://exemplo.com/a" },
  { title: "Notícia B", description: "Desc B", url: "https://exemplo.com/b" },
  { title: "Notícia C", description: "Desc C", url: "https://exemplo.com/c" },
];

beforeEach(() => {
  getMock.mockReset();
  invokeMock.mockReset();
  recordProviderUsageMock.mockReset();
  recordProviderUsageMock.mockResolvedValue(undefined);
  checkAndReserveBudgetMock.mockReset();
  checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-1" });
  reconcileBudgetMock.mockReset();
  releaseBudgetMock.mockReset();
  process.env.GNEWS_API_KEY = "test-key";
});

describe("newsFetcherNode — candidateQueue (Fase 6)", () => {
  it("monta candidateQueue com as demais notícias, excluindo a escolhida", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 3, articles } });
    invokeMock.mockResolvedValue({ raw: {}, parsed: { index: 1, reason: "mais aderente" } });

    const result = await newsFetcherNode(baseState);

    expect(result.sourceUrl).toBe("https://exemplo.com/b");
    expect(result.candidateTitle).toBe("Notícia B");
    expect(result.candidateQueue).toEqual([
      { url: "https://exemplo.com/a", title: "Notícia A" },
      { url: "https://exemplo.com/c", title: "Notícia C" },
    ]);
  });

  it("candidateQueue vazia quando não há artigos", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 0, articles: [] } });

    const result = await newsFetcherNode(baseState);

    expect(result.sourceUrl).toBeUndefined();
    expect(result.candidateQueue ?? []).toEqual([]);
  });
});

describe("newsFetcherNode — circuit breaker de orçamento (Fase 9B.0)", () => {
  it("bloqueado pelo guard (allowed:false): NÃO chama axios/GNews, degrada como 'zero artigos'", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: false, mode: "ENFORCE", reason: "daily_budget_exceeded" });

    const result = await newsFetcherNode(baseState);

    expect(getMock).not.toHaveBeenCalled();
    expect(result.sourceUrl).toBeUndefined();
    expect(result.candidatesFound).toBe(0);
    expect(recordProviderUsageMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "BudgetExceededError", success: false }));
  });

  it("reserva com estimatedCost=0 (GNews sem custo monetário confirmado)", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 0, articles: [] } });
    await newsFetcherNode(baseState);
    expect(checkAndReserveBudgetMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "gnews", operation: "news_search", estimatedCost: 0 }));
  });

  it("reconcilia a reserva (custo 0) após busca bem-sucedida", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 3, articles } });
    invokeMock.mockResolvedValue({ raw: {}, parsed: { index: 0, reason: "ok" } });
    await newsFetcherNode(baseState);
    expect(reconcileBudgetMock).toHaveBeenCalledWith("res-1", 0);
  });
});
