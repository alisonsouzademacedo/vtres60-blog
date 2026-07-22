import { beforeEach, describe, expect, it, vi } from "vitest";

const readFileMock = vi.fn();
vi.mock("node:fs", () => ({ promises: { readFile: (...a: unknown[]) => readFileMock(...a) } }));

import { fetchAllCommodities, TRACKED_COMMODITIES } from "./commodities-provider";

function referenceJson(overrides: Partial<{ fetchedAt: string; series: Record<string, { label: string; unit: string; value: number }> }> = {}) {
  return JSON.stringify({
    source: "World Bank Commodity Markets (Pink Sheet)",
    sourceUrl: "https://www.worldbank.org/en/research/commodity-markets",
    fileUrl: "https://thedocs.worldbank.org/x.xlsx",
    license: "CC-BY (Creative Commons Attribution)",
    referenceMonth: "2026M06",
    publishedOn: "July 02, 2026",
    fetchedAt: overrides.fetchedAt ?? new Date().toISOString(),
    series: overrides.series ?? {
      oil: { label: "Crude oil, average", unit: "($/bbl)", value: 81.7 },
      copper: { label: "Copper", unit: "($/mt)", value: 13552 },
      aluminum: { label: "Aluminum", unit: "($/mt)", value: 3439 },
      iron_ore: { label: "Iron ore, cfr spot", unit: "($/dmtu)", value: 100.8 },
    },
  });
}

beforeEach(() => {
  readFileMock.mockReset();
});

describe("fetchAllCommodities", () => {
  it("dado mensal real: petróleo/cobre/alumínio vêm com valor, unidade e frequência mensal", async () => {
    readFileMock.mockResolvedValue(referenceJson());
    const result = await fetchAllCommodities();

    const oil = result.find((r) => r.id === "oil")!;
    expect(oil.value).toBe(81.7);
    expect(oil.unit).toBe("($/bbl)");
    expect(oil.frequency).toBe("Mensal");
    expect(oil.freshnessStatus).not.toBe("unavailable");

    const copper = result.find((r) => r.id === "copper")!;
    expect(copper.value).toBe(13552);
    const aluminum = result.find((r) => r.id === "aluminum")!;
    expect(aluminum.value).toBe(3439);
  });

  it("aço NUNCA é substituído pelo valor de minério de ferro — sempre indisponível", async () => {
    readFileMock.mockResolvedValue(referenceJson());
    const result = await fetchAllCommodities();
    const steel = result.find((r) => r.id === "steel")!;
    expect(steel.value).toBeNull();
    expect(steel.freshnessStatus).toBe("unavailable");
    expect(steel.formattedValue).toBe("Dados indisponíveis");
    expect(steel.error).toMatch(/minério de ferro/i);
    // confirma que nao ha decisao IMPLEMENT_LIVE/DELAYED para aco nesta fase
    expect(TRACKED_COMMODITIES.find((c) => c.id === "steel")!.decision).toBe("UNAVAILABLE_NO_RELIABLE_SOURCE");
  });

  it("dado stale (>45 dias): freshnessStatus vira stale mas mantém o valor com timestamp visível", async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    readFileMock.mockResolvedValue(referenceJson({ fetchedAt: oldDate }));
    const result = await fetchAllCommodities();
    const oil = result.find((r) => r.id === "oil")!;
    expect(oil.freshnessStatus).toBe("stale");
    expect(oil.value).toBe(81.7);
    expect(oil.updatedAt).toBe(oldDate);
  });

  it("dado velho demais (>100 dias): vira unavailable, não fica stale indefinidamente", async () => {
    const veryOldDate = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString();
    readFileMock.mockResolvedValue(referenceJson({ fetchedAt: veryOldDate }));
    const result = await fetchAllCommodities();
    const oil = result.find((r) => r.id === "oil")!;
    expect(oil.freshnessStatus).toBe("unavailable");
    expect(oil.error).toMatch(/desatualizada/i);
  });

  it("série incorreta/ausente é rejeitada, não inventa valor", async () => {
    readFileMock.mockResolvedValue(referenceJson({ series: { copper: { label: "Copper", unit: "($/mt)", value: 13552 } } }));
    const result = await fetchAllCommodities();
    const oil = result.find((r) => r.id === "oil")!;
    expect(oil.value).toBeNull();
    expect(oil.freshnessStatus).toBe("unavailable");
    expect(oil.error).toMatch(/ausente/i);
  });

  it("arquivo de referência ausente/inválido: todos indisponíveis, sem exceção não tratada", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    const result = await fetchAllCommodities();
    for (const item of result.filter((r) => r.id !== "steel")) {
      expect(item.freshnessStatus).toBe("unavailable");
    }
  });
});
