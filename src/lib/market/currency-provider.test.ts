import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));

import { _resetCurrencyCacheForTests, fetchAllCurrencies, getCachedCurrencies } from "./currency-provider";

beforeEach(() => {
  getMock.mockReset();
  _resetCurrencyCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

function usdPeriodResponse(records: { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }[]) {
  return { data: { value: records } };
}

describe("fetchAllCurrencies", () => {
  it("resposta válida: calcula valor atual, variação e formato em BRL", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("CotacaoDolarPeriodo")) {
        return usdPeriodResponse([
          { cotacaoCompra: 5.07, cotacaoVenda: 5.08, dataHoraCotacao: "2026-07-20 13:05:00.000000" },
          { cotacaoCompra: 5.08, cotacaoVenda: 5.10, dataHoraCotacao: "2026-07-21 13:05:00.000000" },
        ]);
      }
      if (url.includes("CotacaoMoedaPeriodo")) {
        return usdPeriodResponse([
          { cotacaoCompra: 5.79, cotacaoVenda: 5.80, dataHoraCotacao: "2026-07-20 13:05:00.000000", tipoBoletim: "Fechamento" } as never,
          { cotacaoCompra: 5.80, cotacaoVenda: 5.82, dataHoraCotacao: "2026-07-21 13:05:00.000000", tipoBoletim: "Fechamento PTAX" } as never,
        ]);
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const result = await fetchAllCurrencies();
    const usd = result.find((r) => r.id === "usd-brl")!;
    expect(usd.value).toBeCloseTo(5.10);
    expect(usd.formattedValue).toBe("R$ 5.1000");
    expect(usd.variation).toBeCloseTo(((5.1 - 5.08) / 5.08) * 100, 1);
    expect(usd.freshnessStatus).not.toBe("unavailable");
    expect(usd.sourceName).toMatch(/PTAX/);

    const eur = result.find((r) => r.id === "eur-brl")!;
    expect(eur.value).toBeCloseTo(5.82);
  });

  it("EUR: escolhe o boletim de dataHoraCotacao mais recente do dia, ignorando o rótulo tipoBoletim", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("CotacaoDolarPeriodo")) return usdPeriodResponse([{ cotacaoCompra: 5, cotacaoVenda: 5, dataHoraCotacao: "2026-07-21 13:00:00.000000" }]);
      if (url.includes("CotacaoMoedaPeriodo")) {
        return usdPeriodResponse([
          { cotacaoCompra: 5.70, cotacaoVenda: 5.71, dataHoraCotacao: "2026-07-21 10:00:00.000000", tipoBoletim: "Abertura" } as never,
          { cotacaoCompra: 5.75, cotacaoVenda: 5.76, dataHoraCotacao: "2026-07-21 13:10:00.000000", tipoBoletim: "Fechamento" } as never,
        ]);
      }
      throw new Error("inesperado");
    });
    const result = await fetchAllCurrencies();
    const eur = result.find((r) => r.id === "eur-brl")!;
    expect(eur.value).toBeCloseTo(5.76);
  });

  it("sem registro anterior (só 1 dia disponível): variação fica null, sem dividir por zero", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("CotacaoDolarPeriodo")) return usdPeriodResponse([{ cotacaoCompra: 5.0, cotacaoVenda: 5.02, dataHoraCotacao: "2026-07-21 13:00:00.000000" }]);
      if (url.includes("CotacaoMoedaPeriodo")) return usdPeriodResponse([]);
      throw new Error("inesperado");
    });
    const result = await fetchAllCurrencies();
    const usd = result.find((r) => r.id === "usd-brl")!;
    expect(usd.variation).toBeNull();
    const eur = result.find((r) => r.id === "eur-brl")!;
    expect(eur.freshnessStatus).toBe("unavailable");
  });

  it("fim de semana / feriado prolongado (nenhum registro no período): unavailable, nunca mock", async () => {
    getMock.mockImplementation(async () => usdPeriodResponse([]));
    const result = await fetchAllCurrencies();
    for (const item of result) {
      expect(item.freshnessStatus).toBe("unavailable");
      expect(item.formattedValue).toBe("Indisponível");
    }
  });

  it("API indisponível (exceção de rede): unavailable com mensagem de erro, nunca volta para mock antigo", async () => {
    getMock.mockRejectedValue(new Error("timeout de conexão"));
    const result = await fetchAllCurrencies();
    for (const item of result) {
      expect(item.freshnessStatus).toBe("unavailable");
      expect(item.error).toMatch(/timeout/);
    }
  });
});

describe("getCachedCurrencies", () => {
  it("cacheia por 1h: segunda chamada não bate na API de novo", async () => {
    getMock.mockImplementation(async () => usdPeriodResponse([{ cotacaoCompra: 5, cotacaoVenda: 5.01, dataHoraCotacao: "2026-07-21 13:00:00.000000" }]));

    const first = await getCachedCurrencies();
    expect(first.cacheHit).toBe(false);
    const callsAfterFirst = getMock.mock.calls.length;

    const second = await getCachedCurrencies();
    expect(second.cacheHit).toBe(true);
    expect(getMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("refaz a chamada após reset do cache", async () => {
    getMock.mockImplementation(async () => usdPeriodResponse([{ cotacaoCompra: 5, cotacaoVenda: 5.01, dataHoraCotacao: "2026-07-21 13:00:00.000000" }]));
    await getCachedCurrencies();
    _resetCurrencyCacheForTests();
    const callsAfterFirst = getMock.mock.calls.length;
    const second = await getCachedCurrencies();
    expect(second.cacheHit).toBe(false);
    expect(getMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
