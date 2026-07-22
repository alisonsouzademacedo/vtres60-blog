// Fase 8B — evento de conversao para CTAs comerciais (ex: whatsapp_click).
// Reaproveita o MESMO gtag/dataLayer ja inicializado por AnalyticsScripts/
// ConsentBanner (ver analytics-scripts.tsx, consent-banner.tsx): quando
// window.gtag existe (fluxo sem GTM), o evento vai direto para GA4/Ads;
// quando so ha GTM (window.gtag ausente por design — ver comentario em
// analytics-scripts.tsx), o push cai no dataLayer para uma tag/trigger do
// proprio GTM. Nunca os dois ao mesmo tempo — evita duplicar o evento.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, params: Record<string, string | undefined>): void {
  if (typeof window === "undefined") return;
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
  if (typeof window.gtag === "function") {
    window.gtag("event", name, cleanParams);
    return;
  }
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event: name, ...cleanParams });
}
