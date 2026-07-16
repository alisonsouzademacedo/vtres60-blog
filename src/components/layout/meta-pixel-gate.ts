// Fase 7 (Secao 3/23) — logica pura de decisao "o Pixel deve carregar
// agora?", extraida de analytics-scripts.tsx para ser testavel: o
// vitest.config.ts deste projeto roda em environment:"node" sem plugin
// JSX/React (mesmo motivo documentado em taxonomy-matches.ts), entao
// nenhum .tsx pode ser importado direto por um teste. O comportamento em
// runtime real (fbq de fato disparando, rede, navegacao SPA) e coberto
// por Playwright (Secao 25), nao aqui.
export interface MetaPixelGateInput {
  metaPixelId: string;
  metaPixelManagedByGtm: boolean;
  marketingConsent: boolean;
  pathname: string | null | undefined;
}

const VALID_ID = /^[A-Za-z0-9_-]+$/;

export function isAdminRoute(pathname: string | null | undefined): boolean {
  return pathname?.startsWith("/admin") ?? false;
}

export function sanitizePixelId(value: string): string {
  return VALID_ID.test(value) ? value : "";
}

export function shouldLoadMetaPixel(input: MetaPixelGateInput): boolean {
  if (isAdminRoute(input.pathname)) return false;
  if (input.metaPixelManagedByGtm) return false;
  if (!input.marketingConsent) return false;
  return sanitizePixelId(input.metaPixelId) !== "";
}
