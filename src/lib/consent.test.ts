import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("consent (sem window — ambiente server)", () => {
  it("readStoredConsent retorna undefined quando window é undefined", async () => {
    vi.resetModules();
    const originalWindow = globalThis.window;
    // @ts-expect-error simulando ambiente sem window (SSR)
    delete globalThis.window;
    const { readStoredConsent } = await import("./consent");
    expect(readStoredConsent()).toBeUndefined();
    globalThis.window = originalWindow;
  });
});

describe("consent (com localStorage)", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readStoredConsent retorna undefined quando nada foi salvo", async () => {
    vi.resetModules();
    const { readStoredConsent } = await import("./consent");
    expect(readStoredConsent()).toBeUndefined();
  });

  it("writeStoredConsent persiste e readStoredConsent recupera a mesma decisão", async () => {
    vi.resetModules();
    const { readStoredConsent, writeStoredConsent } = await import("./consent");
    const written = writeStoredConsent({ analytics: true, marketing: false });
    expect(written.analytics).toBe(true);
    expect(written.marketing).toBe(false);
    expect(written.decidedAt).toBeTruthy();

    const read = readStoredConsent();
    expect(read).toEqual(written);
  });

  it("readStoredConsent ignora JSON inválido/corrompido", async () => {
    vi.resetModules();
    const { readStoredConsent } = await import("./consent");
    store.vtres60_consent_v1 = "{not valid json";
    expect(readStoredConsent()).toBeUndefined();
  });

  it("readStoredConsent ignora objeto com formato inesperado", async () => {
    vi.resetModules();
    const { readStoredConsent } = await import("./consent");
    store.vtres60_consent_v1 = JSON.stringify({ analytics: "sim" });
    expect(readStoredConsent()).toBeUndefined();
  });
});
