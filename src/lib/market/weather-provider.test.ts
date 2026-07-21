import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));

import {
  DEFAULT_CITY,
  _resetWeatherCacheForTests,
  fetchWeather,
  getCachedWeather,
  nearestReferenceCity,
  REFERENCE_CITIES,
  roundCoordinate,
} from "./weather-provider";

beforeEach(() => {
  getMock.mockReset();
  _resetWeatherCacheForTests();
});

function inmetResponse(ibgeCode: string, period: "manha" | "tarde" | "noite" = "manha") {
  return {
    status: 200,
    data: {
      [ibgeCode]: {
        "21/07/2026": {
          [period]: { uf: "RS", entidade: "Santa Maria", resumo: "Céu claro", temp_max: 22, temp_min: 14, umidade_max: 90, umidade_min: 60 },
        },
      },
    },
  };
}

describe("fetchWeather", () => {
  it("Santa Maria (padrão): resposta válida vira snapshot com fonte e frequência", async () => {
    getMock.mockResolvedValue(inmetResponse(DEFAULT_CITY.ibgeCode, "manha"));
    const snapshot = await fetchWeather();
    expect(snapshot.city).toBe("Santa Maria");
    expect(snapshot.state).toBe("RS");
    expect(snapshot.sourceName).toMatch(/INMET/);
    expect(snapshot.freshnessStatus).toBe("delayed");
    expect(["manha", "tarde", "noite"]).toContain(snapshot.period);
  });

  it("usa User-Agent de navegador (INMET bloqueia UA padrão de bot)", async () => {
    getMock.mockResolvedValue(inmetResponse(DEFAULT_CITY.ibgeCode));
    await fetchWeather();
    const [, config] = getMock.mock.calls[0];
    expect(config.headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("timeout/erro de rede: unavailable, nunca volta para o mock antigo (Joinville)", async () => {
    getMock.mockRejectedValue(new Error("timeout de conexão"));
    const snapshot = await fetchWeather();
    expect(snapshot.freshnessStatus).toBe("unavailable");
    expect(snapshot.city).toBe("Santa Maria");
    expect(snapshot.error).toMatch(/timeout/);
  });

  it("HTTP não-200: unavailable com detalhe do status", async () => {
    getMock.mockResolvedValue({ status: 503, data: {} });
    const snapshot = await fetchWeather();
    expect(snapshot.freshnessStatus).toBe("unavailable");
    expect(snapshot.error).toMatch(/503/);
  });

  it("código IBGE ausente na resposta: unavailable, não inventa dado", async () => {
    getMock.mockResolvedValue({ status: 200, data: { "9999999": {} } });
    const snapshot = await fetchWeather();
    expect(snapshot.freshnessStatus).toBe("unavailable");
  });

  it("outra cidade de referência (ex.: Porto Alegre): usa o código IBGE correto", async () => {
    const poa = REFERENCE_CITIES.find((c) => c.name === "Porto Alegre")!;
    getMock.mockResolvedValue(inmetResponse(poa.ibgeCode));
    await fetchWeather(poa);
    const [url] = getMock.mock.calls[0];
    expect(url).toContain(poa.ibgeCode);
  });
});

describe("getCachedWeather", () => {
  it("cacheia por cidade: segunda chamada da mesma cidade não bate na API de novo", async () => {
    getMock.mockResolvedValue(inmetResponse(DEFAULT_CITY.ibgeCode));
    const first = await getCachedWeather();
    expect(first.cacheHit).toBe(false);
    const callsAfterFirst = getMock.mock.calls.length;
    const second = await getCachedWeather();
    expect(second.cacheHit).toBe(true);
    expect(getMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("cidades diferentes têm cache independente", async () => {
    const poa = REFERENCE_CITIES.find((c) => c.name === "Porto Alegre")!;
    getMock.mockImplementation(async (url: string) => inmetResponse(url.includes(poa.ibgeCode) ? poa.ibgeCode : DEFAULT_CITY.ibgeCode));
    await getCachedWeather(DEFAULT_CITY);
    const result = await getCachedWeather(poa);
    expect(result.cacheHit).toBe(false);
  });
});

describe("roundCoordinate", () => {
  it("arredonda para 1 casa decimal (~11km), nunca guarda a coordenada exata", () => {
    expect(roundCoordinate(-29.68427)).toBe(-29.7);
    expect(roundCoordinate(-53.80691)).toBe(-53.8);
  });
});

describe("nearestReferenceCity", () => {
  it("encontra a capital mais próxima de uma coordenada real", () => {
    // Proximo de Porto Alegre
    const city = nearestReferenceCity(-30.03, -51.23);
    expect(city.name).toBe("Porto Alegre");
  });

  it("volta para Santa Maria (padrão) quando nenhuma capital está a menos de 400km", () => {
    // Meio do oceano Atlantico, longe de qualquer capital de referencia
    const city = nearestReferenceCity(-25, -30);
    expect(city).toEqual(DEFAULT_CITY);
  });

  it("permite voltar para Santa Maria mesmo após localização (padrão sempre disponível)", () => {
    expect(DEFAULT_CITY.name).toBe("Santa Maria");
    expect(DEFAULT_CITY.state).toBe("RS");
  });
});
