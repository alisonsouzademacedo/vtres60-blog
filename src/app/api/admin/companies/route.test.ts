import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    listCompanies: vi.fn(),
    createCompany: (...a: unknown[]) => createMock(...a),
    log: (...a: unknown[]) => logMock(...a),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  createMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/companies", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/companies", () => {
  it("rejeita sem website (campo obrigatório da spec)", async () => {
    const response = await POST(jsonRequest({ name: "Empresa X", slug: "empresa-x", description: "desc", sector: "Setor" }));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita com os campos mínimos obrigatórios", async () => {
    createMock.mockResolvedValue({ id: "company-x", name: "Empresa X", slug: "empresa-x" });
    const response = await POST(jsonRequest({ name: "Empresa X", slug: "empresa-x", description: "desc", sector: "Setor", website: "https://empresa-x.com", active: true, featured: false }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalled();
  });
});
