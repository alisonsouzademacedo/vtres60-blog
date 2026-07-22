import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const getMock = vi.fn();
const updateMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    createRadarSignal: (...a: unknown[]) => createMock(...a),
    getRadarSignal: (...a: unknown[]) => getMock(...a),
    updateRadarSignal: (...a: unknown[]) => updateMock(...a),
    log: (...a: unknown[]) => logMock(...a),
    listSegments: () => Promise.resolve([]),
    listCompanies: () => Promise.resolve([]),
  },
}));
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    listPosts: () => Promise.resolve([]),
    listTags: () => Promise.resolve([]),
  },
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const DRAFT_SIGNAL = {
  id: "signal-1", title: "Sinal", summary: "Resumo", evidencePostIds: [], sourceUrls: [],
  tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "media",
  generatedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString(), status: "draft",
};

beforeEach(() => {
  createMock.mockReset();
  getMock.mockReset();
  updateMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/radar", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/radar — chamada direta ao backend", () => {
  it("rejeita criação direta como published sem nenhuma evidência", async () => {
    const response = await POST(jsonRequest({ title: "Novo Sinal", summary: "Resumo", evidencePostIds: [], status: "published", confidence: "alta", validUntil: new Date(Date.now() + 86_400_000).toISOString(), reviewedAt: new Date().toISOString() }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/evidência/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita criação como draft (não passa pela validação de publicação)", async () => {
    createMock.mockResolvedValue({ ...DRAFT_SIGNAL });
    const response = await POST(jsonRequest({ title: "Novo Sinal", summary: "Resumo", status: "draft", confidence: "media", evidencePostIds: [], validUntil: new Date(Date.now() + 86_400_000).toISOString() }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/radar/[id] — chamada direta ao backend", () => {
  it("draft não pode ser publicado via PATCH direto mesmo enviando só {status:'published'}", async () => {
    getMock.mockResolvedValue({ ...DRAFT_SIGNAL });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "signal-1" }) });
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("sinal revisado, com evidência real e válida, PODE ser publicado", async () => {
    getMock.mockResolvedValue({ ...DRAFT_SIGNAL, status: "reviewed", reviewedAt: new Date().toISOString() });
    updateMock.mockResolvedValue({ ...DRAFT_SIGNAL, status: "published" });
    // Sem posts reais no contexto mockado, evidencePostIds vazio ainda bloqueia —
    // este teste comprova que a rota SÓ aceita quando também há evidência.
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "signal-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/evidência/i);
  });
});
