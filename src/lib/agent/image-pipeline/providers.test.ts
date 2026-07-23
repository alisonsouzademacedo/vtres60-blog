import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...a: unknown[]) => getMock(...a), post: (...a: unknown[]) => postMock(...a), isAxiosError: () => false },
}));

const recordProviderUsageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../costs/usage-repository", () => ({ recordProviderUsage: (...a: unknown[]) => recordProviderUsageMock(...a) }));

// Fase 9B.0 — este arquivo (image-pipeline/providers.ts) e o novo
// integration point do circuit breaker para Replicate/Pexels. Mesmo mock
// completo de @/lib/supabase (via circuit-breaker.ts) usado nos outros
// testes de guard.
const checkAndReserveBudgetMock = vi.fn().mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-1" });
const reconcileBudgetMock = vi.fn().mockResolvedValue(undefined);
const releaseBudgetMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../budget/circuit-breaker", () => ({
  checkAndReserveBudget: (...a: unknown[]) => checkAndReserveBudgetMock(...a),
  reconcileBudget: (...a: unknown[]) => reconcileBudgetMock(...a),
  releaseBudget: (...a: unknown[]) => releaseBudgetMock(...a),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

import { fetchPexelsCandidates, generateWithReplicate } from "./providers";

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  recordProviderUsageMock.mockReset();
  recordProviderUsageMock.mockResolvedValue(undefined);
  checkAndReserveBudgetMock.mockReset();
  checkAndReserveBudgetMock.mockResolvedValue({ allowed: true, mode: "DISABLED", reservationId: "res-1" });
  reconcileBudgetMock.mockReset();
  releaseBudgetMock.mockReset();
  process.env.PEXELS_API_KEY = "test-key";
  process.env.REPLICATE_API_TOKEN = "test-token";
});

describe("fetchPexelsCandidates — circuit breaker (Fase 9B.0)", () => {
  it("bloqueado pelo guard: NÃO chama axios, devolve lista vazia (mesma degradação de uma falha de rede)", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: false, mode: "ENFORCE", reason: "daily_budget_exceeded" });
    const result = await fetchPexelsCandidates("aço industrial", "run-1");
    expect(getMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
    expect(recordProviderUsageMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "BudgetExceededError", success: false }));
  });

  it("reserva com estimatedCost=0 (Pexels sem custo monetário confirmado)", async () => {
    getMock.mockResolvedValue({ data: { photos: [] } });
    await fetchPexelsCandidates("aço industrial", "run-1");
    expect(checkAndReserveBudgetMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "pexels", operation: "pexels_search", estimatedCost: 0 }));
  });

  it("reconcilia (custo 0) após busca bem-sucedida", async () => {
    getMock.mockResolvedValue({ data: { photos: [] } });
    await fetchPexelsCandidates("aço industrial", "run-1");
    expect(reconcileBudgetMock).toHaveBeenCalledWith("res-1", 0);
  });

  it("libera a reserva quando a chamada falha", async () => {
    getMock.mockRejectedValue(new Error("network"));
    await fetchPexelsCandidates("aço industrial", "run-1");
    expect(releaseBudgetMock).toHaveBeenCalledWith("res-1");
  });
});

describe("generateWithReplicate — circuit breaker (Fase 9B.0)", () => {
  it("bloqueado pelo guard: NÃO chama axios, devolve undefined (mesma degradação de uma falha 402/rede)", async () => {
    checkAndReserveBudgetMock.mockResolvedValue({ allowed: false, mode: "ENFORCE", reason: "monthly_budget_exceeded" });
    const result = await generateWithReplicate("uma fábrica moderna", "run-1");
    expect(postMock).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
    expect(recordProviderUsageMock).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "BudgetExceededError", success: false }));
  });

  it("reserva com o preço confirmado do Replicate (US$0,003/imagem)", async () => {
    postMock.mockResolvedValue({ data: { id: "pred-1", status: "succeeded", output: ["https://img"] } });
    await generateWithReplicate("uma fábrica moderna", "run-1");
    expect(checkAndReserveBudgetMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "replicate", operation: "image_generation", estimatedCost: 0.003 }));
  });

  it("reconcilia com o custo real (0.003 em sucesso, 0 em falha) — nunca a estimativa cega", async () => {
    postMock.mockResolvedValue({ data: { id: "pred-1", status: "succeeded", output: ["https://img"] } });
    await generateWithReplicate("uma fábrica moderna", "run-1");
    expect(reconcileBudgetMock).toHaveBeenCalledWith("res-1", 0.003);
  });

  it("predição falha (status!=succeeded): reconcilia custo 0, não libera (chamada real aconteceu)", async () => {
    postMock.mockResolvedValue({ data: { id: "pred-1", status: "failed", output: null, error: "boom" } });
    await generateWithReplicate("uma fábrica moderna", "run-1");
    expect(reconcileBudgetMock).toHaveBeenCalledWith("res-1", 0);
    expect(releaseBudgetMock).not.toHaveBeenCalled();
  });

  it("libera a reserva quando a chamada de rede falha (nunca chegou a gastar)", async () => {
    postMock.mockRejectedValue(new Error("timeout"));
    await generateWithReplicate("uma fábrica moderna", "run-1");
    expect(releaseBudgetMock).toHaveBeenCalledWith("res-1");
  });
});
