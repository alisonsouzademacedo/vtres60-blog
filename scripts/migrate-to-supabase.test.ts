import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPlan, buildPlan } from "./migrate-to-supabase";

const mappers = {
  authors: { toRow: (record: { id: string; name: string }) => ({ id: record.id, name: record.name }) },
  categories: { toRow: (record: { id: string; name: string }) => ({ id: record.id, name: record.name }) },
  tags: { toRow: (record: { id: string; name: string }) => ({ id: record.id, name: record.name }) },
  posts: { toRow: (record: { id: string; title: string }) => ({ id: record.id, title: record.title }) },
  "educational-articles": { toRow: (record: { id: string; title: string }) => ({ id: record.id, title: record.title }) },
};
const tables = { authors: "authors", categories: "categories", tags: "tags", posts: "posts", "educational-articles": "educational_articles" };

let tempDir: string;
let contentDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "migrate-to-supabase-test-"));
  contentDir = path.join(tempDir, "src", "content");
  await fs.mkdir(contentDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeContentFile(name: string, content: unknown) {
  await fs.writeFile(path.join(contentDir, `${name}.json`), JSON.stringify(content), "utf8");
}

describe("buildPlan (usado tanto em preview quanto em apply — nunca escreve)", () => {
  it("lê registros reais quando o arquivo existe e não está vazio", async () => {
    await writeContentFile("authors", [{ id: "a1", name: "Redação" }]);
    const plans = await buildPlan(mappers, tables, contentDir);
    const authorsPlan = plans.find((p) => p.collection === "authors")!;
    expect(authorsPlan.records).toEqual([{ id: "a1", name: "Redação" }]);
    expect(authorsPlan.rows).toEqual([{ id: "a1", name: "Redação" }]);
  });

  it("trata arquivo ausente como 0 registros, nunca como erro", async () => {
    const plans = await buildPlan(mappers, tables, contentDir);
    expect(plans.every((p) => p.records.length === 0)).toBe(true);
  });

  it("trata arquivo vazio ([]) como 0 registros", async () => {
    await writeContentFile("posts", []);
    const plans = await buildPlan(mappers, tables, contentDir);
    expect(plans.find((p) => p.collection === "posts")!.records).toEqual([]);
  });
});

describe("applyPlan (só deve ser chamado depois de assertSafeToWrite)", () => {
  it("chama upsert só para coleções com registros reais, nunca para coleções vazias", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabaseAdmin = { from: () => ({ upsert }) };
    const plans = [
      { collection: "authors" as const, table: "authors", records: [{ id: "a1" }], rows: [{ id: "a1" }], ids: ["a1"] },
      { collection: "posts" as const, table: "posts", records: [], rows: [], ids: [] },
    ];
    await applyPlan(supabaseAdmin, plans);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith([{ id: "a1" }], { onConflict: "id" });
  });

  it("é idempotente: aplicar o mesmo plano duas vezes produz a mesma chamada de upsert", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const supabaseAdmin = { from: () => ({ upsert }) };
    const plans = [{ collection: "authors" as const, table: "authors", records: [{ id: "a1" }], rows: [{ id: "a1" }], ids: ["a1"] }];
    await applyPlan(supabaseAdmin, plans);
    await applyPlan(supabaseAdmin, plans);
    expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1]);
  });
});
