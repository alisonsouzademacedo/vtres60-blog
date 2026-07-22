import { describe, expect, it } from "vitest";
import { validateEventPublication } from "./event-publish-rules";

const VALID_PUBLISH_INPUT = {
  name: "Fenasucro & Agrocana",
  startDate: "2026-08-11",
  endDate: "2026-08-14",
  officialUrl: "https://www.fenasucro.com.br",
  dataStatus: "official_verified" as const,
  verifiedAt: "2026-07-21T20:00:00.000Z",
  status: "published" as const,
};

describe("validateEventPublication", () => {
  it("evento verificado pode ser publicado (nenhum erro)", () => {
    const errors = validateEventPublication(VALID_PUBLISH_INPUT, { status: "verified" });
    expect(errors).toEqual([]);
  });

  it("candidato não pode ser publicado (status anterior incompatível)", () => {
    const errors = validateEventPublication(VALID_PUBLISH_INPUT, { status: "candidate" });
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("criação direta como published (sem status anterior) é rejeitada", () => {
    const errors = validateEventPublication(VALID_PUBLISH_INPUT, undefined);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("não verificado (dataStatus unverified) não pode ser publicado", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, dataStatus: "unverified" }, { status: "verified" });
    expect(errors.some((e) => e.field === "dataStatus")).toBe(true);
  });

  it("verifiedAt ausente impede publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, verifiedAt: undefined }, { status: "verified" });
    expect(errors.some((e) => e.field === "verifiedAt")).toBe(true);
  });

  it("officialUrl ausente impede publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, officialUrl: "" }, { status: "verified" });
    expect(errors.some((e) => e.field === "officialUrl")).toBe(true);
  });

  it("data inválida (endDate anterior a startDate) impede publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, startDate: "2026-08-14", endDate: "2026-08-11" }, { status: "verified" });
    expect(errors.some((e) => e.field === "endDate")).toBe(true);
  });

  it("name ausente impede publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, name: "" }, { status: "verified" });
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("atualização de published para candidate NÃO passa pela validação de publicação (regra só se aplica ao publicar)", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, status: "candidate" }, { status: "published" });
    expect(errors).toEqual([]);
  });

  it("arquivamento (published -> archived) não passa pela validação de publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, status: "archived" }, { status: "published" });
    expect(errors).toEqual([]);
  });

  it("cancelamento (verified -> cancelled) não passa pela validação de publicação", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, status: "cancelled", dataStatus: "unverified", verifiedAt: undefined, officialUrl: "" }, { status: "verified" });
    expect(errors).toEqual([]);
  });

  it("mensagens de erro são legíveis (texto em português, não código bruto)", () => {
    const errors = validateEventPublication({ ...VALID_PUBLISH_INPUT, dataStatus: "unverified" }, { status: "verified" });
    expect(errors[0].message).toMatch(/verifica/i);
  });
});
