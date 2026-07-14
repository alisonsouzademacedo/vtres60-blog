import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));

const selectMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({ select: (...a: unknown[]) => selectMock(...a) }) } }));

import {
  checkGNewsHealth,
  checkOpenAiHealth,
  checkPexelsHealth,
  checkReplicateHealth,
  checkSupabaseHealth,
} from "./provider-health";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  getMock.mockReset();
  selectMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("checkOpenAiHealth", () => {
  it("not_configured quando OPENAI_API_KEY ausente", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("not_configured");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("healthy quando autenticado e gpt-4o está na lista de modelos", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    getMock.mockResolvedValue({ status: 200, data: { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] } });
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("healthy");
  });

  it("degraded quando autenticado mas gpt-4o não está na lista", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    getMock.mockResolvedValue({ status: 200, data: { data: [{ id: "gpt-3.5-turbo" }] } });
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("degraded");
  });

  it("unavailable em 401 (chave inválida)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    getMock.mockResolvedValue({ status: 401, data: {} });
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("unavailable");
  });

  it("degraded em 429 (rate limit)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    getMock.mockResolvedValue({ status: 429, data: {} });
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("degraded");
  });

  it("unavailable quando a chamada lança exceção (rede/timeout)", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    getMock.mockRejectedValue(new Error("timeout"));
    const r = await checkOpenAiHealth();
    expect(r.status).toBe("unavailable");
    expect(r.detail).toMatch(/timeout/);
  });
});

describe("checkGNewsHealth", () => {
  it("not_configured quando GNEWS_API_KEY ausente", async () => {
    delete process.env.GNEWS_API_KEY;
    const r = await checkGNewsHealth();
    expect(r.status).toBe("not_configured");
  });

  it("healthy em 200", async () => {
    process.env.GNEWS_API_KEY = "test";
    getMock.mockResolvedValue({ status: 200, data: { totalArticles: 5 } });
    const r = await checkGNewsHealth();
    expect(r.status).toBe("healthy");
  });

  it("degraded em 429 (cota esgotada)", async () => {
    process.env.GNEWS_API_KEY = "test";
    getMock.mockResolvedValue({ status: 429, data: {} });
    const r = await checkGNewsHealth();
    expect(r.status).toBe("degraded");
  });
});

describe("checkReplicateHealth", () => {
  it("not_configured quando REPLICATE_API_TOKEN ausente", async () => {
    delete process.env.REPLICATE_API_TOKEN;
    const r = await checkReplicateHealth();
    expect(r.status).toBe("not_configured");
  });

  it("billing_unknown quando autenticado e modelo existe — nunca confirma saldo", async () => {
    process.env.REPLICATE_API_TOKEN = "test";
    getMock.mockResolvedValue({ status: 200, data: {} });
    const r = await checkReplicateHealth();
    expect(r.status).toBe("billing_unknown");
    expect(r.detail).toMatch(/saldo/i);
  });

  it("unavailable em 401", async () => {
    process.env.REPLICATE_API_TOKEN = "test";
    getMock.mockResolvedValue({ status: 401, data: {} });
    const r = await checkReplicateHealth();
    expect(r.status).toBe("unavailable");
  });
});

describe("checkPexelsHealth", () => {
  it("not_configured quando PEXELS_API_KEY ausente", async () => {
    delete process.env.PEXELS_API_KEY;
    const r = await checkPexelsHealth();
    expect(r.status).toBe("not_configured");
  });

  it("healthy em 200", async () => {
    process.env.PEXELS_API_KEY = "test";
    getMock.mockResolvedValue({ status: 200, data: {}, headers: { "x-ratelimit-remaining": "199" } });
    const r = await checkPexelsHealth();
    expect(r.status).toBe("healthy");
    expect(r.detail).toMatch(/199/);
  });
});

describe("checkSupabaseHealth", () => {
  it("healthy quando o SELECT não retorna erro", async () => {
    selectMock.mockResolvedValue({ error: null, count: 13 });
    const r = await checkSupabaseHealth();
    expect(r.status).toBe("healthy");
  });

  it("unavailable quando o SELECT retorna erro", async () => {
    selectMock.mockResolvedValue({ error: { message: "schema cache error" }, count: null });
    const r = await checkSupabaseHealth();
    expect(r.status).toBe("unavailable");
    expect(r.detail).toBe("schema cache error");
  });
});
