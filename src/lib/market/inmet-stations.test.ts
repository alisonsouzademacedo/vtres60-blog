import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));

import {
  _resetStationCacheForTests,
  fetchActiveStations,
  nearestActiveStation,
  resolveLocationToCity,
} from "./inmet-stations";

const SANTA_MARIA_STATION = {
  CD_ESTACAO: "A803",
  DC_NOME: "SANTA MARIA",
  SG_ESTADO: "RS",
  VL_LATITUDE: "-29.72499999",
  VL_LONGITUDE: "-53.72055554",
  CD_SITUACAO: "Operante",
};
const CAXIAS_STATION = {
  CD_ESTACAO: "B840x",
  DC_NOME: "CAXIAS DO SUL",
  SG_ESTADO: "RS",
  VL_LATITUDE: "-29.1634",
  VL_LONGITUDE: "-51.1797",
  CD_SITUACAO: "Operante",
};
const INACTIVE_STATION = {
  CD_ESTACAO: "A000",
  DC_NOME: "ESTACAO MORTA",
  SG_ESTADO: "RS",
  VL_LATITUDE: "-29.68",
  VL_LONGITUDE: "-53.80",
  CD_SITUACAO: "Pane",
};

beforeEach(() => {
  getMock.mockReset();
  _resetStationCacheForTests();
});

describe("fetchActiveStations", () => {
  it("filtra só estações com CD_SITUACAO Operante", async () => {
    getMock.mockResolvedValue({ status: 200, data: [SANTA_MARIA_STATION, INACTIVE_STATION] });
    const stations = await fetchActiveStations();
    expect(stations).toHaveLength(1);
    expect(stations[0].code).toBe("A803");
    expect(stations[0].active).toBe(true);
  });

  it("usa User-Agent de navegador (mesmo WAF do apiprevmet3)", async () => {
    getMock.mockResolvedValue({ status: 200, data: [] });
    await fetchActiveStations();
    const [, config] = getMock.mock.calls[0];
    expect(config.headers["User-Agent"]).toMatch(/Mozilla/);
  });

  it("API indisponível: retorna lista vazia, não lança exceção não tratada", async () => {
    getMock.mockRejectedValue(new Error("timeout"));
    const stations = await fetchActiveStations();
    expect(stations).toEqual([]);
  });
});

describe("nearestActiveStation", () => {
  const stations = [SANTA_MARIA_STATION, CAXIAS_STATION].map((s) => ({
    code: s.CD_ESTACAO,
    name: s.DC_NOME,
    state: s.SG_ESTADO,
    latitude: Number(s.VL_LATITUDE),
    longitude: Number(s.VL_LONGITUDE),
    active: true,
  }));

  it("encontra a estação ativa mais próxima por Haversine — não a capital mais próxima", () => {
    // Coordenada de Santa Maria: a estacao SANTA MARIA deve vencer, nao Caxias do Sul
    const result = nearestActiveStation(stations, -29.6842, -53.8069, 100);
    expect(result?.station.name).toBe("SANTA MARIA");
    expect(result?.distanceKm).toBeLessThan(20);
  });

  it("um usuário perto de Caxias do Sul (não capital) deve resolver para a estação de Caxias, não Porto Alegre", () => {
    // Coordenada real de Caxias do Sul
    const result = nearestActiveStation(stations, -29.1678, -51.1794, 100);
    expect(result?.station.name).toBe("CAXIAS DO SUL");
  });

  it("retorna null quando nenhuma estação está dentro da distância máxima", () => {
    // Coordenada no meio do Atlantico, longe de qualquer estacao de teste
    const result = nearestActiveStation(stations, -25, -30, 100);
    expect(result).toBeNull();
  });
});

describe("resolveLocationToCity", () => {
  it("resolve a estação mais próxima para o município real via IBGE, sem mapear para uma capital arbitrária", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("apitempo.inmet.gov.br")) return { status: 200, data: [CAXIAS_STATION] };
      if (url.includes("servicodados.ibge.gov.br")) {
        return { status: 200, data: [{ id: 4305108, nome: "Caxias do Sul" }] };
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const result = await resolveLocationToCity(-29.1678, -51.1794);
    expect(result?.city.name).toBe("Caxias do Sul");
    expect(result?.city.ibgeCode).toBe("4305108");
    expect(result?.stationName).toBe("CAXIAS DO SUL");
    expect(result?.distanceKm).toBeLessThan(5);
  });

  it("nunca apresenta uma capital distante como se fosse a localização do usuário — retorna null se não houver estação próxima", async () => {
    getMock.mockResolvedValue({ status: 200, data: [SANTA_MARIA_STATION] });
    // Coordenada muito longe de qualquer estação de teste disponível
    const result = await resolveLocationToCity(-25, -30);
    expect(result).toBeNull();
  });

  it("se a busca de código IBGE falhar, retorna null em vez de usar dado adivinhado", async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("apitempo.inmet.gov.br")) return { status: 200, data: [CAXIAS_STATION] };
      if (url.includes("servicodados.ibge.gov.br")) return { status: 200, data: [] };
      throw new Error("inesperado");
    });
    const result = await resolveLocationToCity(-29.1678, -51.1794);
    expect(result).toBeNull();
  });

  it("cacheia o catálogo de estações — duas resoluções seguidas não batem 2x na API de estações", async () => {
    let stationCalls = 0;
    getMock.mockImplementation(async (url: string) => {
      if (url.includes("apitempo.inmet.gov.br")) {
        stationCalls += 1;
        return { status: 200, data: [CAXIAS_STATION] };
      }
      if (url.includes("servicodados.ibge.gov.br")) return { status: 200, data: [{ id: 4305108, nome: "Caxias do Sul" }] };
      throw new Error("inesperado");
    });
    await resolveLocationToCity(-29.1678, -51.1794);
    await resolveLocationToCity(-29.1678, -51.1794);
    expect(stationCalls).toBe(1);
  });
});
