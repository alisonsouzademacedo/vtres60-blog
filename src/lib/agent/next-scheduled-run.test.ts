import { describe, expect, it } from "vitest";
import { nextScheduledRun } from "./next-scheduled-run";

describe("nextScheduledRun", () => {
  it("antes das 08:00 UTC (05:00 local) => proxima e hoje as 08:00 UTC", () => {
    const result = nextScheduledRun(new Date("2026-07-13T07:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-13T08:00:00.000Z");
  });

  it("exatamente as 08:00 UTC => ja disparou, proxima e hoje as 20:00 UTC", () => {
    const result = nextScheduledRun(new Date("2026-07-13T08:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-13T20:00:00.000Z");
  });

  it("entre os dois horarios => proxima e hoje as 20:00 UTC", () => {
    const result = nextScheduledRun(new Date("2026-07-13T10:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-13T20:00:00.000Z");
  });

  it("depois das 20:00 UTC => proxima e amanha as 08:00 UTC", () => {
    const result = nextScheduledRun(new Date("2026-07-13T21:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });

  it("perto da virada do dia => proxima e amanha as 08:00 UTC", () => {
    const result = nextScheduledRun(new Date("2026-07-13T23:59:00.000Z"));
    expect(result.toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });
});
