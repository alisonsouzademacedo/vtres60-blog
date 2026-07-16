import { describe, expect, it } from "vitest";
import { resolvePrice } from "./resolve-price";
import type { ManualPriceEntry } from "./cost-settings-repository";

function manualEntry(overrides: Partial<ManualPriceEntry> = {}): ManualPriceEntry {
  return {
    id: "m1",
    provider: "openai",
    model: "gpt-4o",
    unit: "per_1k_input_tokens",
    inputCost: 0.003,
    outputCost: undefined,
    imageComputeCost: undefined,
    currency: "USD",
    effectiveFrom: "2026-01-01",
    note: undefined,
    source: undefined,
    active: true,
    ...overrides,
  };
}

describe("resolvePrice", () => {
  it("prefers OFFICIAL_VERIFIED (replicate image price, confirmed live) over anything manual", () => {
    const result = resolvePrice("replicate", "black-forest-labs/flux-schnell", "per_image", [
      manualEntry({ provider: "replicate", model: "black-forest-labs/flux-schnell", unit: "per_image", inputCost: 999 }),
    ]);
    expect(result.source).toBe("OFFICIAL_VERIFIED");
    expect(result.price).toBeCloseTo(0.003, 6);
  });

  it("falls back to an active MANUAL entry when no official-verified price exists for that provider/model/unit", () => {
    const result = resolvePrice("supabase", "storage", "flat_free", [
      manualEntry({ provider: "supabase", model: "storage", unit: "flat_free", inputCost: 0.0213 }),
    ]);
    expect(result.source).toBe("MANUAL");
    expect(result.price).toBe(0.0213);
  });

  it("ignores an inactive manual entry", () => {
    const result = resolvePrice("supabase", "storage", "flat_free", [
      manualEntry({ provider: "supabase", model: "storage", unit: "flat_free", active: false }),
    ]);
    expect(result.source).toBe("UNAVAILABLE");
  });

  it("falls back to ESTIMATED (pricing.ts verified:false) when no manual entry exists", () => {
    const result = resolvePrice("openai", "gpt-4o", "per_1k_output_tokens", []);
    expect(result.source).toBe("ESTIMATED");
    expect(result.price).toBeGreaterThan(0);
  });

  it("returns UNAVAILABLE for a completely unknown provider/model/unit combination", () => {
    const result = resolvePrice("openai", "gpt-9-imaginary", "per_1k_input_tokens", []);
    expect(result.source).toBe("UNAVAILABLE");
    expect(result.price).toBeUndefined();
  });
});
