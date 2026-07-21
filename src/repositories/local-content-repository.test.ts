import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("local-content-repository.ts — mapeamento de impact (Fase 2)", () => {
  const source = readFileSync(path.join(__dirname, "local-content-repository.ts"), "utf8");

  it("NÃO usa mais excerpt como fallback de impact", () => {
    expect(source).not.toMatch(/impact:\s*post\.impact\s*\|\|\s*post\.excerpt/);
  });

  it("mapeia impact diretamente do post (sem fallback automático)", () => {
    expect(source).toMatch(/impact:post\.impact,/);
  });

  it("preserva compareByRecency na ordenação (Fase 1, não deve regredir)", () => {
    expect(source).toMatch(/import \{ compareByRecency \} from "@\/lib\/article-ordering"/);
    expect(source).toMatch(/\.sort\(compareByRecency\)/);
  });
});

const listPostsMock = vi.fn();
vi.mock("@/services/editorial", () => ({
  editorialRepository: { listPosts: (...args: unknown[]) => listPostsMock(...args) },
}));
vi.mock("@/services/operations", () => ({
  operationsRepository: { listEvents: vi.fn(), listSegments: vi.fn() },
}));

import { countPostsBySegment, visible } from "./local-content-repository";

function post(overrides: Partial<{ status: string; scheduledAt: string; segmentSlugs: string[] }> = {}) {
  return { status: "published", scheduledAt: "", segmentSlugs: [], ...overrides };
}

beforeEach(() => {
  listPostsMock.mockReset();
});

describe("visible — regra de visibilidade pública (Fase 8B, mesma regra reaproveitada para contagem)", () => {
  it("published sempre é visível", () => expect(visible("published", "")).toBe(true));
  it("draft nunca é visível", () => expect(visible("draft", "")).toBe(false));
  it("scheduled com data futura não é visível", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(visible("scheduled", future)).toBe(false);
  });
  it("scheduled com data passada é visível", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(visible("scheduled", past)).toBe(true);
  });
});

describe("countPostsBySegment — contagem real calculada a partir de posts.segment_slugs", () => {
  it("conta apenas posts publicados e visíveis com o slug", async () => {
    listPostsMock.mockResolvedValue([
      post({ segmentSlugs: ["metalurgia"] }),
      post({ segmentSlugs: ["metalurgia", "textil"] }),
      post({ status: "draft", segmentSlugs: ["metalurgia"] }),
    ]);
    const counts = await countPostsBySegment();
    expect(counts.metalurgia).toBe(2);
    expect(counts.textil).toBe(1);
  });

  it("draft nunca entra na contagem pública", async () => {
    listPostsMock.mockResolvedValue([post({ status: "draft", segmentSlugs: ["metalurgia"] })]);
    const counts = await countPostsBySegment();
    expect(counts.metalurgia ?? 0).toBe(0);
  });

  it("post com múltiplos segmentos conta em cada um deles", async () => {
    listPostsMock.mockResolvedValue([post({ segmentSlugs: ["metalurgia", "textil", "quimico"] })]);
    const counts = await countPostsBySegment();
    expect(counts.metalurgia).toBe(1);
    expect(counts.textil).toBe(1);
    expect(counts.quimico).toBe(1);
  });

  it("lista de segmentos vazia não incrementa nenhum contador", async () => {
    listPostsMock.mockResolvedValue([post({ segmentSlugs: [] })]);
    const counts = await countPostsBySegment();
    expect(Object.keys(counts)).toHaveLength(0);
  });

  it("sem nenhum post publicado, retorna objeto vazio (segmento sem cobertura)", async () => {
    listPostsMock.mockResolvedValue([]);
    const counts = await countPostsBySegment();
    expect(counts).toEqual({});
  });
});
