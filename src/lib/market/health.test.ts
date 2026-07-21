import { beforeEach, describe, expect, it, vi } from "vitest";

const weatherMock = vi.fn();
vi.mock("./weather-provider", () => ({ fetchWeather: (...a: unknown[]) => weatherMock(...a) }));

const currenciesMock = vi.fn();
vi.mock("./currency-provider", () => ({ fetchAllCurrencies: (...a: unknown[]) => currenciesMock(...a) }));

const readFileMock = vi.fn();
vi.mock("node:fs", () => ({ promises: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

import { checkCommoditiesHealth, checkCurrenciesHealth, checkWeatherHealth } from "./health";

beforeEach(() => {
  weatherMock.mockReset();
  currenciesMock.mockReset();
  readFileMock.mockReset();
});

describe("checkWeatherHealth", () => {
  it("healthy quando INMET responde com dado válido", async () => {
    weatherMock.mockResolvedValue({ freshnessStatus: "delayed", city: "Santa Maria", state: "RS", period: "tarde" });
    const r = await checkWeatherHealth();
    expect(r.status).toBe("healthy");
    expect(r.lastSuccessAt).toBeDefined();
  });

  it("unavailable quando o provider reporta unavailable", async () => {
    weatherMock.mockResolvedValue({ freshnessStatus: "unavailable", error: "timeout" });
    const r = await checkWeatherHealth();
    expect(r.status).toBe("unavailable");
    expect(r.detail).toBe("timeout");
  });
});

describe("checkCurrenciesHealth", () => {
  it("healthy quando todas as moedas estão disponíveis", async () => {
    currenciesMock.mockResolvedValue([{ freshnessStatus: "live", label: "Dólar" }, { freshnessStatus: "delayed", label: "Euro" }]);
    const r = await checkCurrenciesHealth();
    expect(r.status).toBe("healthy");
  });

  it("degraded quando só parte das moedas falhou", async () => {
    currenciesMock.mockResolvedValue([{ freshnessStatus: "live", label: "Dólar" }, { freshnessStatus: "unavailable", label: "Euro" }]);
    const r = await checkCurrenciesHealth();
    expect(r.status).toBe("degraded");
    expect(r.detail).toMatch(/Euro/);
  });

  it("unavailable quando todas falharam", async () => {
    currenciesMock.mockResolvedValue([{ freshnessStatus: "unavailable", label: "Dólar" }, { freshnessStatus: "unavailable", label: "Euro" }]);
    const r = await checkCurrenciesHealth();
    expect(r.status).toBe("unavailable");
  });
});

describe("checkCommoditiesHealth", () => {
  it("healthy quando a referência é recente", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ fetchedAt: new Date().toISOString() }));
    const r = await checkCommoditiesHealth();
    expect(r.status).toBe("healthy");
  });

  it("degraded quando a referência está velha (>45 dias)", async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ fetchedAt: new Date(Date.now() - 60 * 86400000).toISOString() }));
    const r = await checkCommoditiesHealth();
    expect(r.status).toBe("degraded");
  });

  it("unavailable quando o arquivo de referência não existe", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    const r = await checkCommoditiesHealth();
    expect(r.status).toBe("unavailable");
  });
});
