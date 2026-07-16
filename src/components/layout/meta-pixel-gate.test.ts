import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminRoute, sanitizePixelId, shouldLoadMetaPixel } from "./meta-pixel-gate";

// Secao 23, caso 13: o snippet <noscript> tradicional do Meta dispara uma
// requisicao sem JavaScript e por isso nunca participa do consentimento —
// nao pode existir de forma incondicional neste componente (Secao 3).
describe("analytics-scripts.tsx does not ship an unconditional <noscript> Pixel fallback", () => {
  it("has no <noscript> tag in source", () => {
    const source = readFileSync(path.join(__dirname, "analytics-scripts.tsx"), "utf8");
    expect(source).not.toMatch(/<noscript/i);
  });
});

const base = {
  metaPixelId: "1616807870007590",
  metaPixelManagedByGtm: false,
  marketingConsent: true,
  pathname: "/blog/noticias/alguma-noticia",
};

describe("sanitizePixelId", () => {
  it("accepts a numeric Meta Pixel id", () => {
    expect(sanitizePixelId("1616807870007590")).toBe("1616807870007590");
  });

  it("rejects ids with script-breaking characters", () => {
    expect(sanitizePixelId("abc';alert(1)//")).toBe("");
  });

  it("rejects empty string", () => {
    expect(sanitizePixelId("")).toBe("");
  });
});

describe("isAdminRoute", () => {
  it("flags /admin and nested admin paths", () => {
    expect(isAdminRoute("/admin")).toBe(true);
    expect(isAdminRoute("/admin/custos")).toBe(true);
  });

  it("does not flag public routes", () => {
    expect(isAdminRoute("/blog/noticias")).toBe(false);
    expect(isAdminRoute(null)).toBe(false);
    expect(isAdminRoute(undefined)).toBe(false);
  });
});

describe("shouldLoadMetaPixel", () => {
  it("does not load without a configured id", () => {
    expect(shouldLoadMetaPixel({ ...base, metaPixelId: "" })).toBe(false);
  });

  it("does not load without marketing consent", () => {
    expect(shouldLoadMetaPixel({ ...base, marketingConsent: false })).toBe(false);
  });

  it("loads once id is configured and marketing consent is granted", () => {
    expect(shouldLoadMetaPixel(base)).toBe(true);
  });

  it("never loads on admin routes, even with id and consent", () => {
    expect(shouldLoadMetaPixel({ ...base, pathname: "/admin/custos" })).toBe(false);
  });

  it("does not load when managed by GTM, even with id and consent", () => {
    expect(shouldLoadMetaPixel({ ...base, metaPixelManagedByGtm: true })).toBe(false);
  });

  it("rejects a malformed id even with consent", () => {
    expect(shouldLoadMetaPixel({ ...base, metaPixelId: "<script>" })).toBe(false);
  });
});
