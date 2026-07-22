import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fechamento Fase 8C (seção 7): reprodução real da tentativa de publicar
 * um evento não verificado por CHAMADA DIRETA às rotas do backend
 * (POST/PATCH de src/app/api/admin/events), não pela UI do admin — prova
 * que o servidor rejeita mesmo que um cliente malicioso (ou um bug no
 * formulário) tente contornar o aviso visual que já existia antes desta
 * correção.
 */
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const listMock = vi.fn();
const getMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    listEvents: (...a: unknown[]) => listMock(...a),
    getEvent: (...a: unknown[]) => getMock(...a),
    createEvent: (...a: unknown[]) => createMock(...a),
    updateEvent: (...a: unknown[]) => updateMock(...a),
    log: (...a: unknown[]) => logMock(...a),
  },
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const CANDIDATE_EVENT = {
  id: "event-1",
  name: "Evento Teste",
  slug: "evento-teste",
  status: "candidate",
  dataStatus: "unverified",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  officialUrl: "",
};

beforeEach(() => {
  listMock.mockReset();
  getMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/events", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/events — chamada direta ao backend", () => {
  it("rejeita criação direta como published (client não contorna servidor)", async () => {
    const response = await POST(
      jsonRequest({ name: "Novo Evento", slug: "novo-evento", description: "desc", startDate: "2026-09-01", endDate: "2026-09-03", status: "published", dataStatus: "unverified", officialUrl: "" }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/verifica/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("erro é legível (texto em português, código de status estável)", async () => {
    const response = await POST(
      jsonRequest({ name: "Novo Evento", slug: "novo-evento", description: "desc", startDate: "2026-09-01", endDate: "2026-09-03", status: "published", dataStatus: "unverified", officialUrl: "" }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("aceita criação como candidate (não passa pela validação de publicação)", async () => {
    createMock.mockResolvedValue({ ...CANDIDATE_EVENT });
    const response = await POST(
      jsonRequest({ name: "Novo Evento", slug: "novo-evento", description: "desc", startDate: "2026-09-01", endDate: "2026-09-03", status: "candidate", dataStatus: "unverified" }),
    );
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/events/[id] — chamada direta ao backend", () => {
  it("candidato não pode ser publicado via PATCH direto, mesmo enviando só {status:'published'}", async () => {
    getMock.mockResolvedValue({ ...CANDIDATE_EVENT });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/verifica|status/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("verified_at ausente impede publicação mesmo com dataStatus verificado", async () => {
    getMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "verified", dataStatus: "official_verified", officialUrl: "https://exemplo.com", verifiedAt: undefined });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/verificação/i);
  });

  it("evento verificado, com todos os campos, PODE ser publicado", async () => {
    const verified = { ...CANDIDATE_EVENT, status: "verified", dataStatus: "official_verified", officialUrl: "https://exemplo.com", verifiedAt: "2026-07-21T20:00:00.000Z" };
    getMock.mockResolvedValue(verified);
    updateMock.mockResolvedValue({ ...verified, status: "published" });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("atualização de published para candidate não passa pela validação de publicação", async () => {
    getMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "published", dataStatus: "official_verified", officialUrl: "https://exemplo.com", verifiedAt: "2026-07-21T20:00:00.000Z" });
    updateMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "candidate" });
    const response = await PATCH(jsonRequest({ status: "candidate" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });

  it("arquivamento (published -> archived) é aceito sem passar pela validação de publicação", async () => {
    getMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "published", dataStatus: "official_verified", officialUrl: "https://exemplo.com", verifiedAt: "2026-07-21T20:00:00.000Z" });
    updateMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "archived" });
    const response = await PATCH(jsonRequest({ status: "archived" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(200);
  });

  it("cancelamento (verified -> cancelled) é aceito sem exigir verifiedAt/officialUrl", async () => {
    getMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "verified" });
    updateMock.mockResolvedValue({ ...CANDIDATE_EVENT, status: "cancelled" });
    const response = await PATCH(jsonRequest({ status: "cancelled" }), { params: Promise.resolve({ id: "event-1" }) });
    expect(response.status).toBe(200);
  });
});
