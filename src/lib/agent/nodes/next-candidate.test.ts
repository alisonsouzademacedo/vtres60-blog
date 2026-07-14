import { beforeEach, describe, expect, it, vi } from "vitest";

const logMock = vi.fn();
vi.mock("@/services/operations", () => ({ operationsRepository: { log: (...a: unknown[]) => logMock(...a) } }));

import type { AgentState } from "../state";
import { nextCandidateNode } from "./next-candidate";

beforeEach(() => {
  logMock.mockReset();
});

function state(overrides: Partial<AgentState>): AgentState {
  return {
    sourceUrl: "https://exemplo.com/rejeitada",
    candidateQueue: [],
    ...overrides,
  } as AgentState;
}

describe("nextCandidateNode", () => {
  it("avança para a próxima candidata quando a fila não está vazia", async () => {
    const result = await nextCandidateNode(
      state({
        candidatesTried: 1,
        candidateQueue: [
          { url: "https://exemplo.com/proxima", title: "Próxima notícia" },
          { url: "https://exemplo.com/terceira", title: "Terceira notícia" },
        ],
      }),
    );
    expect(result.sourceUrl).toBe("https://exemplo.com/proxima");
    expect(result.candidateTitle).toBe("Próxima notícia");
    expect(result.candidateQueue).toEqual([{ url: "https://exemplo.com/terceira", title: "Terceira notícia" }]);
    expect(result.candidateExhausted).toBe(false);
    expect(result.candidatesTried).toBe(2);
  });

  it("marca candidateExhausted=true quando a fila está vazia", async () => {
    const result = await nextCandidateNode(state({ candidateQueue: [] }));
    expect(result.candidateExhausted).toBe(true);
    expect(result.sourceUrl).toBeUndefined();
  });

  it("reseta campos transitórios do candidato anterior ao avançar", async () => {
    const result = await nextCandidateNode(
      state({
        candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima notícia" }],
        sourceText: "texto da candidata anterior",
        dedupeStatus: "unique",
        isNewsworthy: true,
        draftText: "rascunho anterior",
        draftAttempts: 2,
        auditApproved: true,
        imageResult: { status: "success", tier: "pexels", finalImageUrl: "https://x/y.webp" } as never,
      }),
    );
    expect(result.sourceText).toBe("");
    expect(result.dedupeStatus).toBeUndefined();
    expect(result.isNewsworthy).toBe(false);
    expect(result.draftText).toBe("");
    expect(result.draftAttempts).toBe(0);
    expect(result.auditApproved).toBe(false);
    expect(result.imageResult).toBeUndefined();
  });

  it("registra log ao avançar e ao esgotar a fila", async () => {
    await nextCandidateNode(state({ candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima notícia" }] }));
    expect(logMock).toHaveBeenCalledWith("proxima_candidata", "agente", expect.stringContaining("Próxima notícia"));

    logMock.mockReset();
    await nextCandidateNode(state({ candidateQueue: [] }));
    expect(logMock).toHaveBeenCalledWith("proxima_candidata", "agente", expect.stringContaining("esgotada"));
  });
});
