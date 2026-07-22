import { describe, expect, it } from "vitest";
import { buildDefaultCommercialCta, buildWhatsAppUrl } from "./whatsapp";
import type { PortalSettings, WhatsAppSettings } from "@/types/admin";

const enabled: WhatsAppSettings = {
  displayNumber: "(55) 9663-4475",
  normalizedNumber: "555596634475",
  defaultMessage: "Olá, vim pelo portal de notícias da VTRES60 e gostaria de falar com um especialista.",
  enabled: true,
};

describe("buildWhatsAppUrl", () => {
  it("monta a URL wa.me com o número normalizado e a mensagem codificada", () => {
    const url = buildWhatsAppUrl(enabled);
    expect(url).toBe(
      "https://wa.me/555596634475?text=Ol%C3%A1%2C%20vim%20pelo%20portal%20de%20not%C3%ADcias%20da%20VTRES60%20e%20gostaria%20de%20falar%20com%20um%20especialista.",
    );
  });

  it("não adiciona dígito ao número — usa exatamente o normalizedNumber fornecido", () => {
    const url = buildWhatsAppUrl(enabled);
    expect(url).toContain("wa.me/555596634475");
    expect(url).not.toContain("wa.me/5555596634475");
    expect(url).not.toContain("wa.me/55955596634475");
  });

  it("remove caracteres não numéricos do normalizedNumber antes de montar a URL", () => {
    const url = buildWhatsAppUrl({ ...enabled, normalizedNumber: "55 (55) 9663-4475" });
    expect(url).toContain("wa.me/555596634475");
  });

  it("retorna undefined quando o canal está desabilitado", () => {
    expect(buildWhatsAppUrl({ ...enabled, enabled: false })).toBeUndefined();
  });

  it("retorna undefined quando normalizedNumber está vazio", () => {
    expect(buildWhatsAppUrl({ ...enabled, normalizedNumber: "" })).toBeUndefined();
  });

  it("retorna undefined quando settings é undefined", () => {
    expect(buildWhatsAppUrl(undefined)).toBeUndefined();
  });

  it("monta a URL sem query string quando a mensagem padrão está vazia", () => {
    const url = buildWhatsAppUrl({ ...enabled, defaultMessage: "" });
    expect(url).toBe("https://wa.me/555596634475");
  });
});

describe("buildDefaultCommercialCta", () => {
  const settings = { contactEmail: "portal@vtres60.com.br", whatsapp: enabled } as PortalSettings;

  it("usa a URL do WhatsApp quando o canal está habilitado", () => {
    const cta = buildDefaultCommercialCta(settings);
    expect(cta.label).toBe("Falar com um especialista");
    expect(cta.url).toContain("wa.me/555596634475");
  });

  it("cai para o e-mail institucional quando o WhatsApp está desabilitado", () => {
    const cta = buildDefaultCommercialCta({ ...settings, whatsapp: { ...enabled, enabled: false } });
    expect(cta.url).toBe("mailto:portal@vtres60.com.br");
  });
});
