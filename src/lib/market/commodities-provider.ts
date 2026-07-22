import { promises as fs } from "node:fs";
import path from "node:path";
import type { CommodityDecision, MarketDatum } from "./types";

/**
 * Fase 8C — referencias de commodities via World Bank Commodity Markets
 * (Pink Sheet), dado publico mensal, licenca CC-BY, sem chave de API.
 * https://www.worldbank.org/en/research/commodity-markets
 *
 * O arquivo fonte e um .xlsx atualizado uma vez por mes — parsear XLSX a
 * cada requisicao do site nao faz sentido (dado nao muda entre
 * requisicoes) e evitamos adicionar uma dependencia npm de parsing de
 * planilha so para isso. Em vez disso, scripts/refresh-commodities-reference.py
 * (script standalone, fora do runtime Node) baixa e extrai os valores
 * relevantes para src/content/commodities-reference.json uma vez por mes;
 * este provider so LE esse JSON, com verificacao de idade/staleness.
 *
 * Decisao por indicador (secao 10 da spec) — cada um documentado em
 * docs/fontes-mercado-clima-fase8c.md:
 * - petroleo/cobre/aluminio: IMPLEMENT_MONTHLY_REFERENCE (serie real do
 *   Banco Mundial, mensal, confirmada).
 * - aco: UNAVAILABLE_NO_RELIABLE_SOURCE — a planilha do Banco Mundial so
 *   tem "Iron ore" (minerio de ferro), NAO aco/produto siderurgico
 *   acabado. Rotular minerio de ferro como "aço" seria exatamente o erro
 *   que a spec proibe explicitamente (secao 9). Nenhuma outra fonte
 *   oficial gratuita de preco de aço foi confirmada nesta fase.
 */

const REFERENCE_PATH = path.join(process.cwd(), "src", "content", "commodities-reference.json");
export const WORLD_BANK_SOURCE_URL = "https://www.worldbank.org/en/research/commodity-markets";

// "dias" de TTL conforme a spec (secao 13) — commodities mensais nao
// precisam de cache curto, mas tem uma idade maxima antes de virar
// UNAVAILABLE em vez de continuar mostrando dado velho indefinidamente.
const STALE_AFTER_DAYS = 45;
const UNAVAILABLE_AFTER_DAYS = 100;

interface CommoditySeriesEntry {
  label: string;
  unit: string;
  value: number;
}

interface CommoditiesReferenceFile {
  source: string;
  sourceUrl: string;
  fileUrl: string;
  license: string;
  referenceMonth: string;
  publishedOn: string | null;
  fetchedAt: string;
  series: Record<string, CommoditySeriesEntry>;
}

export interface CommodityConfig {
  id: string;
  label: string;
  seriesKey: string | null;
  decision: CommodityDecision;
  unavailableReason?: string;
}

export const TRACKED_COMMODITIES: CommodityConfig[] = [
  { id: "oil", label: "Petróleo (referência)", seriesKey: "oil", decision: "IMPLEMENT_MONTHLY_REFERENCE" },
  { id: "copper", label: "Cobre", seriesKey: "copper", decision: "IMPLEMENT_MONTHLY_REFERENCE" },
  { id: "aluminum", label: "Alumínio", seriesKey: "aluminum", decision: "IMPLEMENT_MONTHLY_REFERENCE" },
  {
    id: "steel",
    label: "Aço",
    seriesKey: null,
    decision: "UNAVAILABLE_NO_RELIABLE_SOURCE",
    unavailableReason:
      "Nenhuma fonte oficial gratuita de preço de aço (produto siderúrgico acabado) foi confirmada nesta fase. O World Bank Pink Sheet só publica minério de ferro, que não é a mesma coisa.",
  },
];

async function readReferenceFile(): Promise<CommoditiesReferenceFile | null> {
  try {
    const raw = await fs.readFile(REFERENCE_PATH, "utf8");
    return JSON.parse(raw) as CommoditiesReferenceFile;
  } catch {
    return null;
  }
}

function ageInDays(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
}

export async function fetchAllCommodities(): Promise<MarketDatum[]> {
  const reference = await readReferenceFile();

  return TRACKED_COMMODITIES.map((config): MarketDatum => {
    const baseUrl = reference?.sourceUrl ?? WORLD_BANK_SOURCE_URL;
    const base = {
      id: config.id,
      label: config.label,
      sourceName: reference?.source ?? "World Bank Commodity Markets (Pink Sheet)",
      sourceUrl: baseUrl,
      frequency: "Mensal",
    };

    if (config.decision === "UNAVAILABLE_NO_RELIABLE_SOURCE" || !config.seriesKey) {
      return { ...base, value: null, formattedValue: "Dados indisponíveis", variation: null, variationPeriod: "", unit: "", updatedAt: null, freshnessStatus: "unavailable", error: config.unavailableReason };
    }

    if (!reference) {
      return { ...base, value: null, formattedValue: "Dados indisponíveis", variation: null, variationPeriod: "", unit: "", updatedAt: null, freshnessStatus: "unavailable", error: "Arquivo de referência local (commodities-reference.json) não encontrado ou inválido." };
    }

    const entry = reference.series[config.seriesKey];
    if (!entry) {
      return { ...base, value: null, formattedValue: "Dados indisponíveis", variation: null, variationPeriod: "", unit: "", updatedAt: null, freshnessStatus: "unavailable", error: `Série "${config.seriesKey}" ausente na referência local.` };
    }

    const age = ageInDays(reference.fetchedAt);
    const freshnessStatus = age > UNAVAILABLE_AFTER_DAYS ? "unavailable" : age > STALE_AFTER_DAYS ? "stale" : "delayed";

    return {
      ...base,
      value: entry.value,
      formattedValue: `US$ ${entry.value.toLocaleString("pt-BR")} ${entry.unit}`,
      variation: null,
      variationPeriod: "",
      unit: entry.unit,
      currency: "USD",
      updatedAt: reference.fetchedAt,
      freshnessStatus,
      error: freshnessStatus === "unavailable" ? `Referência de ${reference.referenceMonth} está desatualizada há mais de ${UNAVAILABLE_AFTER_DAYS} dias.` : undefined,
    };
  });
}
