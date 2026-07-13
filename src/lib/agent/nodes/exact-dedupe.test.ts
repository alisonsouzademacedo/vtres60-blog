import { beforeEach, describe, expect, it, vi } from "vitest";

const listPostsMock = vi.fn();
vi.mock("@/services/editorial", () => ({ editorialRepository: { listPosts: (...a: unknown[]) => listPostsMock(...a) } }));

const logMock = vi.fn();
vi.mock("@/services/operations", () => ({ operationsRepository: { log: (...a: unknown[]) => logMock(...a) } }));

const listQueueEntriesMock = vi.fn();
const claimUrlMock = vi.fn();
vi.mock("../queue-repository", () => ({
  listQueueEntries: (...a: unknown[]) => listQueueEntriesMock(...a),
  claimUrl: (...a: unknown[]) => claimUrlMock(...a),
}));

import type { AgentState } from "../state";
import { exactDedupeNode } from "./exact-dedupe";

function baseState(): AgentState {
  return { sourceUrl: "https://exemplo.com/materia" } as AgentState;
}

beforeEach(() => {
  listPostsMock.mockReset();
  listQueueEntriesMock.mockReset();
  claimUrlMock.mockReset();
  logMock.mockReset();
  listPostsMock.mockResolvedValue([]);
  listQueueEntriesMock.mockResolvedValue([]);
  claimUrlMock.mockResolvedValue({ id: "queue-1", url: "x", status: "processed", createdAt: "" });
});

describe("exactDedupeNode (Fase 3)", () => {
  it("unique quando a URL normalizada não existe em public.posts nem em agent_queue — reivindica a URL", async () => {
    const result = await exactDedupeNode(baseState());
    expect(result.dedupeStatus).toBe("unique");
    expect(claimUrlMock).toHaveBeenCalledWith("https://exemplo.com/materia");
  });

  it("exact_duplicate quando a URL normalizada já existe em public.posts (draft ou published)", async () => {
    listPostsMock.mockResolvedValue([{ id: "post-1", sourceUrl: "https://www.exemplo.com/materia?utm_source=x", status: "draft" }]);
    const result = await exactDedupeNode(baseState());
    expect(result.dedupeStatus).toBe("exact_duplicate");
    expect(result.exactDuplicatePostId).toBe("post-1");
    expect(claimUrlMock).not.toHaveBeenCalled();
  });

  it("exact_duplicate quando a URL já está em agent_queue (outra execução)", async () => {
    listQueueEntriesMock.mockResolvedValue([{ id: "queue-outro", url: "https://exemplo.com/materia", status: "processed", createdAt: "" }]);
    const result = await exactDedupeNode(baseState());
    expect(result.dedupeStatus).toBe("exact_duplicate");
    expect(claimUrlMock).not.toHaveBeenCalled();
  });

  it("exclui a própria linha de agent_queue (queueItemId) da checagem — não se auto-marca como duplicata", async () => {
    listQueueEntriesMock.mockResolvedValue([{ id: "queue-atual", url: "https://exemplo.com/materia", status: "processed", createdAt: "" }]);
    const result = await exactDedupeNode({ ...baseState(), queueItemId: "queue-atual" } as AgentState);
    expect(result.dedupeStatus).toBe("unique");
  });

  it("URL com query parameter funcional não reconhecido como tracking NÃO é reduzida à mesma URL sem justificativa", async () => {
    listPostsMock.mockResolvedValue([{ id: "post-1", sourceUrl: "https://exemplo.com/materia?id=42", status: "published" }]);
    const result = await exactDedupeNode({ sourceUrl: "https://exemplo.com/materia?id=99" } as AgentState);
    expect(result.dedupeStatus).toBe("unique");
  });
});
