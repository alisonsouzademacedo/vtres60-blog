import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { rpc: (...args: unknown[]) => rpcMock(...args) } }));

import { checkAndReserveBudget, reconcileBudget, releaseBudget, BudgetExceededError } from "./circuit-breaker";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("checkAndReserveBudget", () => {
  it("modo DISABLED: RPC devolve allowed=true sem checar teto — repassado como está", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, mode: "DISABLED", reservation_id: "res-1" }, error: null });
    const result = await checkAndReserveBudget({ provider: "openai", operation: "draft_generation", estimatedCost: 0.015 });
    expect(result).toEqual({ allowed: true, mode: "DISABLED", reservationId: "res-1", reason: undefined, dailySpent: undefined, monthlySpent: undefined });
    expect(rpcMock).toHaveBeenCalledWith("reserve_provider_budget", {
      p_provider: "openai",
      p_operation: "draft_generation",
      p_estimated_cost: 0.015,
      p_run_id: null,
    });
  });

  it("modo AUDIT: RPC pode devolver allowed=true mesmo acima do teto (nunca bloqueia de verdade)", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, mode: "AUDIT", reservation_id: "res-2", daily_spent: 5, monthly_spent: 50 }, error: null });
    const result = await checkAndReserveBudget({ provider: "openai", operation: "draft_generation", estimatedCost: 10, runId: "run-1" });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("AUDIT");
    expect(result.dailySpent).toBe(5);
  });

  it("modo ENFORCE: RPC bloqueia quando o teto seria excedido", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: false, mode: "ENFORCE", reason: "daily_budget_exceeded" }, error: null });
    const result = await checkAndReserveBudget({ provider: "openai", operation: "draft_generation", estimatedCost: 100 });
    expect(result).toMatchObject({ allowed: false, mode: "ENFORCE", reason: "daily_budget_exceeded" });
  });

  it("passa runId quando fornecido, null quando ausente", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, mode: "DISABLED" }, error: null });
    await checkAndReserveBudget({ provider: "gnews", operation: "news_search", estimatedCost: 0 });
    expect(rpcMock).toHaveBeenCalledWith("reserve_provider_budget", expect.objectContaining({ p_run_id: null }));
  });

  it("Supabase indisponível (RPC lança erro): degrada aberto (DEGRADED_MODE), nunca lança exceção", async () => {
    rpcMock.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
    const result = await checkAndReserveBudget({ provider: "openai", operation: "draft_generation", estimatedCost: 0.015 });
    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("guard_unavailable");
  });

  it("Supabase retorna error no payload (não exception): também degrada aberto", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "relation budget_mode does not exist" } });
    const result = await checkAndReserveBudget({ provider: "openai", operation: "draft_generation", estimatedCost: 0.015 });
    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it("preço ausente (estimatedCost=0, ex: GNews/Pexels): reserva normalmente, nunca inventa custo", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, mode: "DISABLED", reservation_id: "res-3" }, error: null });
    await checkAndReserveBudget({ provider: "gnews", operation: "news_search", estimatedCost: 0 });
    expect(rpcMock).toHaveBeenCalledWith("reserve_provider_budget", expect.objectContaining({ p_estimated_cost: 0 }));
  });
});

describe("reconcileBudget", () => {
  it("chama a RPC de reconciliação com o custo real", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reconcileBudget("res-1", 0.0187);
    expect(rpcMock).toHaveBeenCalledWith("reconcile_provider_budget", { p_reservation_id: "res-1", p_actual_cost: 0.0187 });
  });

  it("custo real MENOR que a estimativa: reconciliação usa o valor real, não a reserva original", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reconcileBudget("res-2", 0.001); // reserva original teria sido maior (ex: 0.015)
    expect(rpcMock).toHaveBeenCalledWith("reconcile_provider_budget", { p_reservation_id: "res-2", p_actual_cost: 0.001 });
  });

  it("custo real MAIOR que a estimativa: reconciliação também aceita, sem limitar ao valor reservado", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reconcileBudget("res-3", 0.5);
    expect(rpcMock).toHaveBeenCalledWith("reconcile_provider_budget", { p_reservation_id: "res-3", p_actual_cost: 0.5 });
  });

  it("sem reservationId: no-op, nunca chama a RPC", async () => {
    await reconcileBudget(undefined, 0.01);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("idempotência: chamar duas vezes na mesma reserva nunca lança — a RPC (idempotente por WHERE status='reserved') decide, o client só repassa", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reconcileBudget("res-4", 0.01);
    await reconcileBudget("res-4", 0.01);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("falha na RPC de reconciliação nunca lança — a reserva expira sozinha em 5min (best-effort, mesma política de recordProviderUsage)", async () => {
    rpcMock.mockRejectedValue(new Error("timeout"));
    await expect(reconcileBudget("res-5", 0.01)).resolves.toBeUndefined();
  });
});

describe("releaseBudget", () => {
  it("chama a RPC de liberação", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await releaseBudget("res-1");
    expect(rpcMock).toHaveBeenCalledWith("release_provider_budget", { p_reservation_id: "res-1" });
  });

  it("sem reservationId: no-op", async () => {
    await releaseBudget(undefined);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("falha na RPC de liberação nunca lança", async () => {
    rpcMock.mockRejectedValue(new Error("timeout"));
    await expect(releaseBudget("res-6")).resolves.toBeUndefined();
  });
});

describe("BudgetExceededError", () => {
  it("carrega provider e reason, mensagem legível para o catch-all das rotas", () => {
    const error = new BudgetExceededError("monthly_budget_exceeded", "openai");
    expect(error.name).toBe("BudgetExceededError");
    expect(error.provider).toBe("openai");
    expect(error.reason).toBe("monthly_budget_exceeded");
    expect(error.message).toContain("openai");
    expect(error.message).toContain("monthly_budget_exceeded");
  });
});
