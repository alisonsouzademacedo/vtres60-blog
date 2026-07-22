import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const getMock = vi.fn();
const updateMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    createIntelligenceItem: (...a: unknown[]) => createMock(...a),
    getIntelligenceItem: (...a: unknown[]) => getMock(...a),
    updateIntelligenceItem: (...a: unknown[]) => updateMock(...a),
    listRadarSignals: () => Promise.resolve([{ id: "signal-1", status: "published" }]),
    log: (...a: unknown[]) => logMock(...a),
    listSegments: () => Promise.resolve([]),
    listCompanies: () => Promise.resolve([]),
  },
}));
vi.mock("@/services/editorial", () => ({
  editorialRepository: { listPosts: () => Promise.resolve([]), listTags: () => Promise.resolve([]) },
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const DRAFT_ITEM = {
  id: "item-1", radarSignalId: "signal-1", kind: "fact", title: "Fato", analysis: "Análise",
  evidencePostIds: [], sourceUrls: [], segmentSlugs: [], companySlugs: [], confidence: "media",
  generatedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString(), status: "draft",
};

beforeEach(() => {
  createMock.mockReset();
  getMock.mockReset();
  updateMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/intelligence", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/intelligence — chamada direta ao backend", () => {
  it("rejeita criação direta como published com radar_signal_id inexistente", async () => {
    const response = await POST(jsonRequest({ radarSignalId: "signal-fantasma", kind: "fact", title: "T", analysis: "A", status: "published", confidence: "alta", validUntil: new Date(Date.now() + 86_400_000).toISOString(), reviewedAt: new Date().toISOString(), evidencePostIds: [] }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/radar/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita criação como draft", async () => {
    createMock.mockResolvedValue({ ...DRAFT_ITEM });
    const response = await POST(jsonRequest({ radarSignalId: "signal-1", kind: "fact", title: "T", analysis: "A", status: "draft", confidence: "media", evidencePostIds: [] }));
    expect(response.status).toBe(201);
  });
});

describe("PATCH /api/admin/intelligence/[id] — chamada direta ao backend", () => {
  it("draft não pode ser publicado via PATCH direto", async () => {
    getMock.mockResolvedValue({ ...DRAFT_ITEM });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "item-1" }) });
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("recommendation sem recommended_action não pode ser publicada", async () => {
    getMock.mockResolvedValue({ ...DRAFT_ITEM, kind: "recommendation", status: "reviewed", reviewedAt: new Date().toISOString(), evidencePostIds: ["p"], sourceUrls: ["https://x.com"] });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "item-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/recomend/i);
  });
});
