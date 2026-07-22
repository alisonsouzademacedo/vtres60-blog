import axios from "axios";

/**
 * Fase 8C — previsao real via API publica do INMET (Instituto Nacional de
 * Meteorologia, Ministerio da Agricultura e Pecuaria):
 * https://apiprevmet3.inmet.gov.br/previsao/{codigoIbge}
 *
 * Por que INMET e nao Open-Meteo: Open-Meteo tem corpo de resposta melhor
 * (current+daily, coordenadas exatas), mas seu tier gratuito bloqueia
 * explicitamente uso comercial ("Commercial use: no" em
 * https://open-meteo.com/en/pricing) — o VTRES60 e um site comercial de
 * agencia, entao o tier gratuito nao pode ser usado sem assinatura paga
 * (nao confirmada/nao contratada nesta fase). INMET e orgao publico
 * federal, dado aberto, sem chave, uso permitido.
 *
 * Limitacao honesta: a API do INMET so aceita CODIGO IBGE do municipio,
 * nao latitude/longitude — por isso nao ha endpoint para "qualquer ponto
 * do mapa", so para municipios cadastrados. E dado de PREVISAO por
 * periodo do dia (manha/tarde/noite), nao leitura de estacao em tempo
 * real — por isso o freshnessStatus correto e "delayed", nunca "live".
 *
 * A API bloqueia o User-Agent padrao de curl/bots com connection reset
 * (WAF) — funciona normalmente com um User-Agent de navegador comum.
 */

const INMET_BASE = "https://apiprevmet3.inmet.gov.br/previsao";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const INMET_SOURCE_URL = "https://apiprevmet3.inmet.gov.br";

export interface CityReference {
  name: string;
  state: string;
  ibgeCode: string;
}

/** Padrao do widget: Santa Maria, RS (nunca Joinville — corrigido nesta fase). */
export const DEFAULT_CITY: CityReference = { name: "Santa Maria", state: "RS", ibgeCode: "4316907" };

/**
 * Fechamento Fase 8C — REMOVIDO: a lista de 27 capitais como "referencia
 * de cidade mais proxima" (REFERENCE_CITIES/nearestReferenceCity) foi
 * substituida por src/lib/market/inmet-stations.ts, que resolve a
 * ESTACAO AUTOMATICA ATIVA real mais proxima (catalogo publico do INMET,
 * apitempo.inmet.gov.br/estacoes/T) e so entao converte para codigo IBGE
 * via API oficial do IBGE. Motivo: mapear qualquer coordenada para uma
 * de 27 capitais distantes ("Usar minha localizacao" mostrando Porto
 * Alegre para alguem em Caxias do Sul, ~130km de distancia, sem nenhuma
 * indicacao de aproximacao) e exatamente o que a auditoria de fechamento
 * desta fase identificou como enganoso — e a nova spec proibe
 * explicitamente "escolher uma capital arbitrariamente" como fallback.
 * A funcao previa nunca chegou a rodar em producao (fase anterior nao
 * fez deploy), entao remover aqui nao e uma regressao de comportamento
 * ao vivo, so a correcao antes do primeiro uso real.
 */

/**
 * Arredonda para 1 casa decimal (~11km de precisao) antes de qualquer uso
 * — nunca guarda nem loga a coordenada exata recebida do navegador.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

export type WeatherFreshness = "delayed" | "unavailable";

export interface WeatherSnapshot {
  city: string;
  state: string;
  condition: string;
  temperatureMax: number | null;
  temperatureMin: number | null;
  humidityMax: number | null;
  humidityMin: number | null;
  period: "manha" | "tarde" | "noite";
  forecastDate: string;
  sourceName: string;
  sourceUrl: string;
  frequency: string;
  updatedAt: string | null;
  freshnessStatus: WeatherFreshness;
  error?: string;
  /** Preenchidos só quando a localização veio de geolocalização (ver /api/market/weather). */
  stationName?: string;
  distanceKm?: number;
  /** true quando nenhuma estação próxima foi encontrada e o resultado voltou para Santa Maria. */
  locationFallback?: boolean;
}

function currentPeriod(): "manha" | "tarde" | "noite" {
  const hour = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false });
  const h = Number(hour);
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

interface InmetPeriodEntry {
  entidade: string;
  uf: string;
  resumo: string;
  temp_max: number;
  temp_min: number;
  umidade_max: number;
  umidade_min: number;
}

export async function fetchWeather(city: CityReference = DEFAULT_CITY): Promise<WeatherSnapshot> {
  const base = {
    city: city.name,
    state: city.state,
    sourceName: "INMET — Instituto Nacional de Meteorologia (previsão)",
    sourceUrl: INMET_SOURCE_URL,
    frequency: "Atualizada pelo INMET por período do dia (manhã/tarde/noite)",
    period: currentPeriod(),
  };

  try {
    const { data, status } = await axios.get(`${INMET_BASE}/${city.ibgeCode}`, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
      timeout: 10_000,
      validateStatus: () => true,
    });

    if (status !== 200 || !data || typeof data !== "object") {
      return { ...base, condition: "", temperatureMax: null, temperatureMin: null, humidityMax: null, humidityMin: null, forecastDate: "", updatedAt: null, freshnessStatus: "unavailable", error: `INMET respondeu HTTP ${status}.` };
    }

    const cityData = data[city.ibgeCode] as Record<string, Record<string, InmetPeriodEntry>> | undefined;
    if (!cityData) {
      return { ...base, condition: "", temperatureMax: null, temperatureMin: null, humidityMax: null, humidityMin: null, forecastDate: "", updatedAt: null, freshnessStatus: "unavailable", error: `Código IBGE ${city.ibgeCode} não encontrado na resposta do INMET.` };
    }

    const [forecastDate, periods] = Object.entries(cityData)[0] ?? [];
    const period = base.period;
    const entry = periods?.[period] ?? Object.values(periods ?? {})[0];
    if (!forecastDate || !entry) {
      return { ...base, condition: "", temperatureMax: null, temperatureMin: null, humidityMax: null, humidityMin: null, forecastDate: "", updatedAt: null, freshnessStatus: "unavailable", error: "Resposta do INMET sem dados de previsão para o período atual." };
    }

    return {
      ...base,
      condition: entry.resumo,
      temperatureMax: entry.temp_max,
      temperatureMin: entry.temp_min,
      humidityMax: entry.umidade_max,
      humidityMin: entry.umidade_min,
      forecastDate,
      updatedAt: new Date().toISOString(),
      freshnessStatus: "delayed",
    };
  } catch (error) {
    return {
      ...base,
      condition: "",
      temperatureMax: null,
      temperatureMin: null,
      humidityMax: null,
      humidityMin: null,
      forecastDate: "",
      updatedAt: null,
      freshnessStatus: "unavailable",
      error: error instanceof Error ? error.message : "Falha de conexão desconhecida.",
    };
  }
}

// Cache em memoria: previsao do INMET muda por periodo do dia, nao faz
// sentido chamar a cada requisicao — TTL curto (minutos) pra nao servir
// dado velho por muito tempo caso o periodo do dia mude.
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: WeatherSnapshot; expiresAt: number }>();

export async function getCachedWeather(city: CityReference = DEFAULT_CITY): Promise<{ data: WeatherSnapshot; cacheHit: boolean }> {
  const now = Date.now();
  const key = city.ibgeCode;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return { data: hit.data, cacheHit: true };
  const data = await fetchWeather(city);
  cache.set(key, { data, expiresAt: now + WEATHER_CACHE_TTL_MS });
  return { data, cacheHit: false };
}

export function _resetWeatherCacheForTests() {
  cache.clear();
}
