import { describe, expect, it } from "vitest";
import { convertToBrl } from "./currency";

describe("convertToBrl", () => {
  it("passes BRL amounts through unchanged, no rate needed", () => {
    const result = convertToBrl(100, "BRL", undefined);
    expect(result).toEqual({ originalAmount: 100, originalCurrency: "BRL", brlAmount: 100, rateApplied: undefined, rateDate: undefined });
  });

  it("converts using the provided rate", () => {
    const result = convertToBrl(10, "USD", { rate: 5.4, rateDate: "2026-07-14" });
    expect(result.brlAmount).toBeCloseTo(54, 6);
    expect(result.rateApplied).toBe(5.4);
    expect(result.rateDate).toBe("2026-07-14");
  });

  it("never invents a rate: no rate configured means brlAmount stays undefined, original amount preserved", () => {
    const result = convertToBrl(10, "USD", undefined);
    expect(result.brlAmount).toBeUndefined();
    expect(result.originalAmount).toBe(10);
    expect(result.originalCurrency).toBe("USD");
  });
});
