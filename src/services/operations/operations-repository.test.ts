import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const contentDir = path.join(process.cwd(), "src", "content");
const radarFile = path.join(contentDir, "radarSignals.json");

async function readRadarFile() {
  try {
    return JSON.parse(await fs.readFile(radarFile, "utf8"));
  } catch {
    return [];
  }
}

describe("operationsRepository — varredura de expiração de sinais do Radar", () => {
  let backup: string | null;

  beforeEach(async () => {
    try {
      backup = await fs.readFile(radarFile, "utf8");
    } catch {
      backup = null;
    }
  });

  afterEach(async () => {
    if (backup !== null) await fs.writeFile(radarFile, backup, "utf8");
    else await fs.rm(radarFile, { force: true });
  });

  it("marca automaticamente como 'expired' um sinal publicado cuja validUntil já passou", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    await fs.writeFile(
      radarFile,
      JSON.stringify([
        {
          id: "signal-1", title: "T", summary: "S", evidencePostIds: ["p1"], sourceUrls: ["https://x.com"],
          tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "alta",
          generatedAt: timestamp, validUntil: past, status: "published", reviewedAt: timestamp, publishedAt: timestamp,
          createdAt: timestamp, updatedAt: timestamp,
        },
      ]),
      "utf8",
    );
    const { operationsRepository } = await import("./operations-repository");
    const items = await operationsRepository.listRadarSignals();
    expect(items[0].status).toBe("expired");
    const persisted = await readRadarFile();
    expect(persisted[0].status).toBe("expired");
  });

  it("não altera um sinal publicado cuja validUntil ainda não passou", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    await fs.writeFile(
      radarFile,
      JSON.stringify([
        {
          id: "signal-2", title: "T", summary: "S", evidencePostIds: ["p1"], sourceUrls: ["https://x.com"],
          tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "alta",
          generatedAt: timestamp, validUntil: future, status: "published", reviewedAt: timestamp, publishedAt: timestamp,
          createdAt: timestamp, updatedAt: timestamp,
        },
      ]),
      "utf8",
    );
    const { operationsRepository } = await import("./operations-repository");
    const items = await operationsRepository.listRadarSignals();
    expect(items[0].status).toBe("published");
  });
});

describe("operationsRepository — seed de companies a partir de src/data/content.ts", () => {
  const companiesFile = path.join(contentDir, "companies.json");
  const marker = path.join(contentDir, ".companies-seed-v1");
  let backup: string | null;
  let markerExisted: boolean;

  beforeEach(async () => {
    try {
      backup = await fs.readFile(companiesFile, "utf8");
    } catch {
      backup = null;
    }
    markerExisted = await fs.access(marker).then(() => true).catch(() => false);
    await fs.rm(companiesFile, { force: true });
    await fs.rm(marker, { force: true });
  });

  afterEach(async () => {
    if (backup !== null) await fs.writeFile(companiesFile, backup, "utf8");
    else await fs.rm(companiesFile, { force: true });
    if (!markerExisted) await fs.rm(marker, { force: true });
  });

  it("popula companies.json com as 6 empresas reais na primeira leitura (sem arquivo nem marcador)", async () => {
    const { operationsRepository } = await import("./operations-repository");
    const items = await operationsRepository.listCompanies();
    expect(items.length).toBe(6);
    const weg = items.find((item) => item.slug === "weg");
    expect(weg?.website).toBe("https://www.weg.net");
    expect(weg?.active).toBe(true);
    const persisted = JSON.parse(await fs.readFile(companiesFile, "utf8"));
    expect(persisted.length).toBe(6);
  });
});
