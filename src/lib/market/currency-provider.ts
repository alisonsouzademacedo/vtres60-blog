import axios from "axios";
import type { MarketDatum } from "./types";

/**
 * Fase 8C — cotacoes reais via PTAX/Banco Central do Brasil (Olinda API,
 * dados abertos, sem chave). NAO e cotacao "ao vivo": PTAX e fechada uma
 * vez por dia util (por isso o rotulo obrigatorio "PTAX - Cotacao de
 * referencia", nunca "ao vivo"). Endpoint oficial:
 * https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata
 *
 * USD usa os endpoints dedicados (CotacaoDolarDia/CotacaoDolarPeriodo), que
 * ja retornam so o fechamento do dia. Qualquer outra moeda usa os
 * endpoints genericos (CotacaoMoedaDia/CotacaoMoedaPeriodo), que retornam
 * TODOS os boletins do dia (Abertura/Intermediario/Fechamento) — o rotulo
 * do ultimo boletim varia ("Fechamento" ou "Fechamento PTAX" conforme o
 * dia), entao a regra usada aqui e pegar o registro de dataHoraCotacao
 * mais recente por dia util, nao filtrar por tipoBoletim.
 */

const PTAX_BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";
export const PTAX_SOURCE_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

interface PtaxRecord {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
}

function formatBcbDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${date.getFullYear()}`;
}

/** Ultimo registro (por dataHoraCotacao) de cada dia presente na lista. */
function lastPerDay(records: PtaxRecord[]): PtaxRecord[] {
  const byDay = new Map<string, PtaxRecord>();
  for (const record of records) {
    const day = record.dataHoraCotacao.slice(0, 10);
    const current = byDay.get(day);
    if (!current || record.dataHoraCotacao > current.dataHoraCotacao) byDay.set(day, record);
  }
  return [...byDay.values()].sort((a, b) => a.dataHoraCotacao.localeCompare(b.dataHoraCotacao));
}

async function fetchUsdPeriod(startDate: Date, endDate: Date): Promise<PtaxRecord[]> {
  const url = `${PTAX_BASE}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`;
  const { data } = await axios.get(url, {
    params: { "@dataInicial": `'${formatBcbDate(startDate)}'`, "@dataFinalCotacao": `'${formatBcbDate(endDate)}'`, $format: "json" },
    timeout: 10_000,
  });
  return data.value as PtaxRecord[];
}

async function fetchMoedaPeriod(moeda: string, startDate: Date, endDate: Date): Promise<PtaxRecord[]> {
  const url = `${PTAX_BASE}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`;
  const { data } = await axios.get(url, {
    params: {
      "@moeda": `'${moeda}'`,
      "@dataInicial": `'${formatBcbDate(startDate)}'`,
      "@dataFinalCotacao": `'${formatBcbDate(endDate)}'`,
      $format: "json",
    },
    timeout: 10_000,
  });
  return lastPerDay(data.value as PtaxRecord[]);
}

export interface CurrencyConfig {
  id: string;
  label: string;
  bcbCode: "USD" | "EUR";
}

export const TRACKED_CURRENCIES: CurrencyConfig[] = [
  { id: "usd-brl", label: "Dólar", bcbCode: "USD" },
  { id: "eur-brl", label: "Euro", bcbCode: "EUR" },
];

/**
 * Busca os ultimos N dias corridos (que cobrem pelo menos 2 dias uteis,
 * mesmo em fins de semana/feriados prolongados) e usa os DOIS ultimos
 * registros retornados como "atual" e "anterior" para a variacao —
 * a API do BCB ja so retorna dias uteis com pregao, entao nao ha divisao
 * por zero nem necessidade de logica de calendario de feriados aqui.
 */
async function fetchRecentQuotes(bcbCode: "USD" | "EUR"): Promise<PtaxRecord[]> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 10);
  return bcbCode === "USD" ? fetchUsdPeriod(startDate, endDate) : fetchMoedaPeriod(bcbCode, startDate, endDate);
}

function computeVariationPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function buildCurrencyDatum(config: CurrencyConfig): Promise<MarketDatum> {
  const base: Omit<MarketDatum, "value" | "formattedValue" | "variation" | "variationPeriod" | "updatedAt" | "freshnessStatus" | "error"> = {
    id: config.id,
    label: config.label,
    unit: "BRL",
    currency: config.bcbCode,
    sourceName: "Banco Central do Brasil — PTAX (cotação de referência)",
    sourceUrl: PTAX_SOURCE_URL,
    frequency: "Diária (dias úteis)",
  };

  try {
    const records = await fetchRecentQuotes(config.bcbCode);
    if (records.length === 0) {
      return { ...base, value: null, formattedValue: "Indisponível", variation: null, variationPeriod: "", updatedAt: null, freshnessStatus: "unavailable", error: "Sem cotação PTAX nos últimos 10 dias corridos." };
    }

    const latest = records[records.length - 1];
    const previous = records.length >= 2 ? records[records.length - 2] : undefined;
    const value = latest.cotacaoVenda;
    const variation = previous ? computeVariationPercent(latest.cotacaoVenda, previous.cotacaoVenda) : null;

    const latestDay = latest.dataHoraCotacao.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const isToday = latestDay === today;

    return {
      ...base,
      value,
      formattedValue: `R$ ${value.toFixed(4)}`,
      variation,
      variationPeriod: previous ? `vs. ${previous.dataHoraCotacao.slice(0, 10)} (dia útil anterior)` : "",
      updatedAt: latest.dataHoraCotacao.replace(" ", "T"),
      freshnessStatus: isToday ? "live" : "delayed",
    };
  } catch (error) {
    return {
      ...base,
      value: null,
      formattedValue: "Indisponível",
      variation: null,
      variationPeriod: "",
      updatedAt: null,
      freshnessStatus: "unavailable",
      error: error instanceof Error ? error.message : "Falha de conexão desconhecida.",
    };
  }
}

export async function fetchAllCurrencies(): Promise<MarketDatum[]> {
  return Promise.all(TRACKED_CURRENCIES.map(buildCurrencyDatum));
}

// Cache em memoria: PTAX fecha uma vez por dia util, entao 1h de TTL e
// generoso o suficiente para nao bater na API a cada requisicao da home,
// sem arriscar mostrar dado desatualizado por muito tempo apos o fechamento.
const CURRENCY_CACHE_TTL_MS = 60 * 60 * 1000;
let cached: { data: MarketDatum[]; expiresAt: number } | undefined;

export async function getCachedCurrencies(): Promise<{ data: MarketDatum[]; cacheHit: boolean }> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return { data: cached.data, cacheHit: true };
  const data = await fetchAllCurrencies();
  cached = { data, expiresAt: now + CURRENCY_CACHE_TTL_MS };
  return { data, cacheHit: false };
}

export function _resetCurrencyCacheForTests() {
  cached = undefined;
}
