import { describe, expect, it } from "vitest";
import { archiveExpiredEvents, computeNextStatus, isEventExpired, isVisibleToPublic, todayInSaoPaulo } from "./event-lifecycle";

// Meio-dia UTC evita qualquer ambiguidade de fuso perto da virada do dia.
const NOON_UTC_2026_07_21 = new Date("2026-07-21T12:00:00Z");

describe("isEventExpired", () => {
  it("evento com endDate no passado está expirado", () => {
    expect(isEventExpired({ endDate: "2026-07-20" }, NOON_UTC_2026_07_21)).toBe(true);
  });

  it("evento com endDate hoje NÃO está expirado (ainda no ar até o fim do dia)", () => {
    expect(isEventExpired({ endDate: "2026-07-21" }, NOON_UTC_2026_07_21)).toBe(false);
  });

  it("evento com endDate no futuro não está expirado", () => {
    expect(isEventExpired({ endDate: "2026-08-14" }, NOON_UTC_2026_07_21)).toBe(false);
  });
});

describe("computeNextStatus", () => {
  it("published + expirado -> archived", () => {
    expect(computeNextStatus({ status: "published", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe("archived");
  });

  it("published + não expirado -> continua published", () => {
    expect(computeNextStatus({ status: "published", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe("published");
  });

  it("candidate nunca é auto-arquivado, mesmo com data no passado (não estava publicado)", () => {
    expect(computeNextStatus({ status: "candidate", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe("candidate");
  });

  it("verified nunca é auto-arquivado (arquivamento só se aplica a published)", () => {
    expect(computeNextStatus({ status: "verified", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe("verified");
  });

  it("cancelled permanece cancelled independente da data", () => {
    expect(computeNextStatus({ status: "cancelled", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe("cancelled");
  });

  it("archived permanece archived (não é excluído nem revertido)", () => {
    expect(computeNextStatus({ status: "archived", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe("archived");
  });
});

describe("isVisibleToPublic", () => {
  it("published + não expirado é visível", () => {
    expect(isVisibleToPublic({ status: "published", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe(true);
  });

  it("published + expirado NÃO é visível (mesmo antes do job de arquivamento rodar)", () => {
    expect(isVisibleToPublic({ status: "published", endDate: "2026-01-01" }, NOON_UTC_2026_07_21)).toBe(false);
  });

  it("candidate não é visível ao público", () => {
    expect(isVisibleToPublic({ status: "candidate", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe(false);
  });

  it("verified (ainda não publicado) não é visível ao público", () => {
    expect(isVisibleToPublic({ status: "verified", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe(false);
  });

  it("archived não é visível", () => {
    expect(isVisibleToPublic({ status: "archived", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe(false);
  });

  it("cancelled não é visível mesmo com datas futuras", () => {
    expect(isVisibleToPublic({ status: "cancelled", endDate: "2026-12-31" }, NOON_UTC_2026_07_21)).toBe(false);
  });
});

describe("archiveExpiredEvents", () => {
  it("retorna só os eventos cujo status realmente mudou", () => {
    const events = [
      { id: "a", status: "published" as const, endDate: "2026-01-01" },
      { id: "b", status: "published" as const, endDate: "2026-12-31" },
      { id: "c", status: "candidate" as const, endDate: "2026-01-01" },
    ];
    const changes = archiveExpiredEvents(events, NOON_UTC_2026_07_21);
    expect(changes).toEqual([{ id: "a", nextStatus: "archived" }]);
  });

  it("lista vazia quando nada expirou", () => {
    const events = [{ id: "a", status: "published" as const, endDate: "2026-12-31" }];
    expect(archiveExpiredEvents(events, NOON_UTC_2026_07_21)).toEqual([]);
  });
});

describe("todayInSaoPaulo", () => {
  it("não muda de dia por causa de UTC vs. America/Sao_Paulo perto da meia-noite", () => {
    // 2026-07-22T01:00:00Z = 2026-07-21T22:00:00 em America/Sao_Paulo (UTC-3)
    const nearMidnightUtc = new Date("2026-07-22T01:00:00Z");
    expect(todayInSaoPaulo(nearMidnightUtc)).toBe("2026-07-21");
  });
});
