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
    candidateHistory: [],
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

  // Fase 7 (Secao 18/20) — candidateHistory registra o motivo de rejeicao
  // de CADA candidata tentada, nao so da ultima. `nextCandidateNode` devolve
  // AgentStateUpdate (tipos de operador do LangGraph, ex: OverwriteValue) —
  // os helpers abaixo apenas fazem o cast de volta para os tipos concretos,
  // ja que esta suite testa VALORES, nao a mecanica de reducer do grafo.
  type CandidateHistoryEntry = { url: string; title: string | undefined; reason: string };
  function historyOf(update: { candidateHistory?: unknown }): CandidateHistoryEntry[] {
    return (update.candidateHistory ?? []) as CandidateHistoryEntry[];
  }

  describe("candidateHistory", () => {
    it("registra exact_duplicate quando dedupeStatus=exact_duplicate", async () => {
      const result = await nextCandidateNode(
        state({ dedupeStatus: "exact_duplicate", candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima" }] }),
      );
      expect(historyOf(result)).toEqual([{ url: "https://exemplo.com/rejeitada", title: undefined, reason: "exact_duplicate" }]);
    });

    it("registra not_newsworthy quando isNewsworthy=false e newsworthinessReason preenchido", async () => {
      const result = await nextCandidateNode(
        state({
          isNewsworthy: false,
          newsworthinessReason: "genérico",
          candidateTitle: "Notícia genérica",
          candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima" }],
        }),
      );
      expect(historyOf(result)).toEqual([{ url: "https://exemplo.com/rejeitada", title: "Notícia genérica", reason: "not_newsworthy" }]);
    });

    it("registra same_event_no_material_update quando dedupeStatus correspondente", async () => {
      const result = await nextCandidateNode(
        state({ dedupeStatus: "same_event_no_material_update", candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima" }] }),
      );
      expect(historyOf(result)[0].reason).toBe("same_event_no_material_update");
    });

    it("registra image_pipeline_failed quando imageResult.status !== success", async () => {
      const result = await nextCandidateNode(
        state({
          imageResult: { status: "failed", reason: "image_pipeline_failed" } as never,
          candidateQueue: [{ url: "https://exemplo.com/proxima", title: "Próxima" }],
        }),
      );
      expect(historyOf(result)[0].reason).toBe("image_pipeline_failed");
    });

    it("acumula entradas ao longo de múltiplas rejeições consecutivas, nunca reseta", async () => {
      const first = await nextCandidateNode(
        state({
          dedupeStatus: "exact_duplicate",
          candidateQueue: [
            { url: "https://exemplo.com/proxima", title: "Próxima" },
            { url: "https://exemplo.com/terceira", title: "Terceira" },
          ],
        }),
      );
      const second = await nextCandidateNode(
        state({
          sourceUrl: first.sourceUrl as string,
          candidateTitle: first.candidateTitle as string | undefined,
          candidateHistory: historyOf(first),
          candidateQueue: first.candidateQueue as { url: string; title: string }[],
          isNewsworthy: false,
          newsworthinessReason: "genérico",
        }),
      );
      expect(historyOf(second)).toHaveLength(2);
      expect(historyOf(second).map((c) => c.reason)).toEqual(["exact_duplicate", "not_newsworthy"]);
    });

    it("não registra entrada quando não há sourceUrl (fila já esgotada sem candidata ativa)", async () => {
      const result = await nextCandidateNode(state({ sourceUrl: undefined, candidateQueue: [] }));
      expect(historyOf(result)).toEqual([]);
    });
  });
});
