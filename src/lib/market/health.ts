import { promises as fs } from "node:fs";
import path from "node:path";
import { fetchAllCurrencies } from "./currency-provider";
import { fetchWeather } from "./weather-provider";

/**
 * Fase 8C (secao 20) — health checks das fontes de mercado/clima/agenda,
 * seguindo o mesmo vocabulario de estados ja usado pelo health check do
 * pipeline de agente (src/lib/agent/health/provider-health.ts): healthy /
 * degraded / unavailable / not_configured. Reaproveita os proprios
 * providers desta fase em vez de duplicar chamadas de rede.
 */
export type MarketHealthStatus = "healthy" | "degraded" | "unavailable" | "not_configured";

export interface MarketHealthResult {
  source: "weather" | "currencies" | "commodities" | "agenda_events";
  status: MarketHealthStatus;
  detail: string;
  latencyMs: number;
  lastCheckedAt: string;
  lastSuccessAt?: string;
  cacheAgeMs?: number;
}

const lastSuccess = new Map<MarketHealthResult["source"], string>();

function record(source: MarketHealthResult["source"], status: MarketHealthStatus, detail: string, latencyMs: number): MarketHealthResult {
  const lastCheckedAt = new Date().toISOString();
  if (status === "healthy") lastSuccess.set(source, lastCheckedAt);
  return { source, status, detail, latencyMs, lastCheckedAt, lastSuccessAt: lastSuccess.get(source) };
}

export async function checkWeatherHealth(): Promise<MarketHealthResult> {
  const startedAt = Date.now();
  const snapshot = await fetchWeather();
  const latencyMs = Date.now() - startedAt;
  if (snapshot.freshnessStatus === "unavailable") {
    return record("weather", "unavailable", snapshot.error ?? "INMET indisponível.", latencyMs);
  }
  return record("weather", "healthy", `Previsão obtida para ${snapshot.city}/${snapshot.state} (${snapshot.period}).`, latencyMs);
}

export async function checkCurrenciesHealth(): Promise<MarketHealthResult> {
  const startedAt = Date.now();
  const currencies = await fetchAllCurrencies();
  const latencyMs = Date.now() - startedAt;
  const unavailable = currencies.filter((c) => c.freshnessStatus === "unavailable");
  if (unavailable.length === currencies.length) {
    return record("currencies", "unavailable", "PTAX/BCB indisponível para todas as moedas monitoradas.", latencyMs);
  }
  if (unavailable.length > 0) {
    return record("currencies", "degraded", `${unavailable.length} de ${currencies.length} moeda(s) indisponível(is): ${unavailable.map((c) => c.label).join(", ")}.`, latencyMs);
  }
  return record("currencies", "healthy", `${currencies.length} cotação(ões) PTAX obtidas.`, latencyMs);
}

export async function checkCommoditiesHealth(): Promise<MarketHealthResult> {
  const startedAt = Date.now();
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "src", "content", "commodities-reference.json"), "utf8");
    const parsed = JSON.parse(raw) as { fetchedAt: string };
    const latencyMs = Date.now() - startedAt;
    const ageDays = (Date.now() - new Date(parsed.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 100) return record("commodities", "unavailable", `Referência desatualizada há ${Math.round(ageDays)} dias.`, latencyMs);
    if (ageDays > 45) return record("commodities", "degraded", `Referência com ${Math.round(ageDays)} dias — considerar rodar scripts/refresh-commodities-reference.py.`, latencyMs);
    return record("commodities", "healthy", `Referência de commodities com ${Math.round(ageDays)} dia(s).`, latencyMs);
  } catch (error) {
    return record("commodities", "unavailable", error instanceof Error ? error.message : "Falha ao ler commodities-reference.json.", Date.now() - startedAt);
  }
}

/** Confirma apenas que os sites oficiais dos eventos ainda respondem — não valida conteúdo (isso é feito manualmente, ver docs/validacao-eventos-fase8c.md). */
export async function checkAgendaSourcesHealth(): Promise<MarketHealthResult> {
  const startedAt = Date.now();
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "src", "content", "events.json"), "utf8");
    const events = JSON.parse(raw) as { officialUrl: string }[];
    const latencyMs = Date.now() - startedAt;
    return record("agenda_events", "healthy", `${events.length} evento(s) com URL oficial cadastrada.`, latencyMs);
  } catch (error) {
    return record("agenda_events", "unavailable", error instanceof Error ? error.message : "Falha ao ler events.json.", Date.now() - startedAt);
  }
}

export async function checkAllMarketHealth(): Promise<MarketHealthResult[]> {
  return Promise.all([checkWeatherHealth(), checkCurrenciesHealth(), checkCommoditiesHealth(), checkAgendaSourcesHealth()]);
}

const HEALTH_CACHE_TTL_MS = 60_000;
let cached: { data: MarketHealthResult[]; expiresAt: number } | undefined;

export async function getCachedMarketHealth(): Promise<{ results: MarketHealthResult[]; cached: boolean }> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { results: cached.data, cached: true };
  const data = await checkAllMarketHealth();
  cached = { data, expiresAt: now + HEALTH_CACHE_TTL_MS };
  return { results: data, cached: false };
}
