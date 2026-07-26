import { describe, expect, it } from "vitest";
import { KNOWN_LEGACY_COMPANY_IDS, legacyCompanyUuid, looksLikeLegacyCompanyId } from "./company-legacy-ids";

describe("legacyCompanyUuid", () => {
  it("é determinístico para cada um dos 6 ids legados reais conhecidos", () => {
    for (const legacyId of KNOWN_LEGACY_COMPANY_IDS) {
      expect(legacyCompanyUuid(legacyId)).toBe(legacyCompanyUuid(legacyId));
    }
  });

  it("produz um UUID v5 válido (versão 5, variante RFC 4122) para cada id legado", () => {
    for (const legacyId of KNOWN_LEGACY_COMPANY_IDS) {
      expect(legacyCompanyUuid(legacyId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("produz 6 UUIDs distintos para os 6 ids legados distintos (sem colisão)", () => {
    const uuids = KNOWN_LEGACY_COMPANY_IDS.map(legacyCompanyUuid);
    expect(new Set(uuids).size).toBe(6);
  });

  it("mapeamento fixo esperado para os 6 ids legados reais (regressão — nunca deve mudar)", () => {
    expect(legacyCompanyUuid("company-weg")).toBe("19cdc9a5-89f3-5532-943c-91f7cfc215db");
    expect(legacyCompanyUuid("company-gerdau")).toBe("185dd603-2931-5549-9de6-6b9b0af85317");
    expect(legacyCompanyUuid("company-marcopolo")).toBe("b476b3c9-8c2c-5ac8-a019-6e443dde0624");
    expect(legacyCompanyUuid("company-randon")).toBe("458a49a7-4a47-5c09-824a-fbdfacb3316f");
    expect(legacyCompanyUuid("company-john-deere")).toBe("bd1e1b42-1037-5c66-a784-2f86ed841b04");
    expect(legacyCompanyUuid("company-tramontina")).toBe("f13d02ed-e0f3-597a-b3ad-c6894ef703c7");
  });
});

describe("looksLikeLegacyCompanyId", () => {
  it("reconhece os 6 ids legados reais", () => {
    for (const legacyId of KNOWN_LEGACY_COMPANY_IDS) expect(looksLikeLegacyCompanyId(legacyId)).toBe(true);
  });

  it("rejeita um UUID real", () => {
    expect(looksLikeLegacyCompanyId("13d5fa9e-6ca9-52c4-816a-ae4859d1c918")).toBe(false);
  });

  it("rejeita um slug puro (sem prefixo company-)", () => {
    expect(looksLikeLegacyCompanyId("weg")).toBe(false);
  });
});
