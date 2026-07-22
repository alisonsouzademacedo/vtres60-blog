import type { PortalSettings, WhatsAppSettings } from "@/types/admin";

/**
 * Monta a URL wa.me a partir da fonte canonica (settings.whatsapp).
 * Retorna undefined quando o canal esta desabilitado ou sem numero
 * normalizado — quem chama deve tratar isso como "CTA ausente", nunca
 * renderizar um link quebrado.
 */
export function buildWhatsAppUrl(settings: WhatsAppSettings | undefined): string | undefined {
  if (!settings?.enabled) return undefined;
  const normalized = (settings.normalizedNumber ?? "").replace(/\D/g, "");
  if (!normalized) return undefined;
  const message = (settings.defaultMessage ?? "").trim();
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${normalized}${query}`;
}

/**
 * CTA comercial persistido por post/artigo (post.cta / article.cta,
 * renderizado como "PROXIMA DECISAO" na pagina do artigo). Usa WhatsApp
 * quando disponivel; cai para o e-mail institucional (settings.contactEmail)
 * apenas se o canal estiver desabilitado — nunca um destino hardcoded.
 */
export function buildDefaultCommercialCta(settings: PortalSettings): { label: string; url: string; text: string } {
  const whatsappUrl = buildWhatsAppUrl(settings.whatsapp);
  return {
    label: "Falar com um especialista",
    url: whatsappUrl ?? `mailto:${settings.contactEmail}`,
    text: "Transforme informação em uma próxima decisão clara.",
  };
}
