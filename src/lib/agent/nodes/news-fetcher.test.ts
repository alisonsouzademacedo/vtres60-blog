import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("axios", () => ({ default: { get: (...a: unknown[]) => getMock(...a) } }));
const invokeMock = vi.fn();
vi.mock("../llm", () => ({ llm: { withStructuredOutput: () => ({ invoke: invokeMock }) } }));

import { newsFetcherNode } from "./news-fetcher";

const articles = [
  { title: "Notícia A", description: "Desc A", url: "https://exemplo.com/a" },
  { title: "Notícia B", description: "Desc B", url: "https://exemplo.com/b" },
  { title: "Notícia C", description: "Desc C", url: "https://exemplo.com/c" },
];

beforeEach(() => {
  getMock.mockReset();
  invokeMock.mockReset();
  process.env.GNEWS_API_KEY = "test-key";
});

describe("newsFetcherNode — candidateQueue (Fase 6)", () => {
  it("monta candidateQueue com as demais notícias, excluindo a escolhida", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 3, articles } });
    invokeMock.mockResolvedValue({ index: 1, reason: "mais aderente" });

    const result = await newsFetcherNode();

    expect(result.sourceUrl).toBe("https://exemplo.com/b");
    expect(result.candidateTitle).toBe("Notícia B");
    expect(result.candidateQueue).toEqual([
      { url: "https://exemplo.com/a", title: "Notícia A" },
      { url: "https://exemplo.com/c", title: "Notícia C" },
    ]);
  });

  it("candidateQueue vazia quando não há artigos", async () => {
    getMock.mockResolvedValue({ data: { totalArticles: 0, articles: [] } });

    const result = await newsFetcherNode();

    expect(result.sourceUrl).toBeUndefined();
    expect(result.candidateQueue ?? []).toEqual([]);
  });
});
