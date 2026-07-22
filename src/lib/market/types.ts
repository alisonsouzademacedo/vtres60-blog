/**
 * Modelo normalizado para dados de mercado (Fase 8C, secao 12 da spec).
 * Usado por moedas e commodities. Clima tem forma propria (weather-provider.ts)
 * porque carrega campos que nao fazem sentido no modelo de cotacao (cidade,
 * coordenadas, condicao, previsao por periodo).
 */
export type FreshnessStatus = "live" | "delayed" | "stale" | "unavailable" | "updating";

export interface MarketDatum {
  id: string;
  label: string;
  value: number | null;
  formattedValue: string;
  variation: number | null;
  variationPeriod: string;
  unit: string;
  currency?: string;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string | null;
  frequency: string;
  freshnessStatus: FreshnessStatus;
  error?: string;
}

export type CommodityDecision =
  | "IMPLEMENT_LIVE"
  | "IMPLEMENT_DELAYED"
  | "IMPLEMENT_MONTHLY_REFERENCE"
  | "UNAVAILABLE_NO_RELIABLE_SOURCE";
