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
  latitude: number;
  longitude: number;
}

/** Padrao do widget: Santa Maria, RS (nunca Joinville — corrigido nesta fase). */
export const DEFAULT_CITY: CityReference = { name: "Santa Maria", state: "RS", ibgeCode: "4316907", latitude: -29.6842, longitude: -53.8069 };

/**
 * Capitais estaduais brasileiras (fatos publicos verificaveis: nome,
 * codigo IBGE do municipio, coordenadas da sede). Usadas apenas como
 * referencia de "cidade mais proxima" para a opcao "usar minha
 * localizacao" — nao e uma cobertura completa dos 5.570 municipios do
 * Brasil (fora do escopo desta fase; ver docs/fontes-mercado-clima-fase8c.md).
 */
export const REFERENCE_CITIES: CityReference[] = [
  { name: "Porto Alegre", state: "RS", ibgeCode: "4314902", latitude: -30.0346, longitude: -51.2177 },
  { name: "Florianópolis", state: "SC", ibgeCode: "4205407", latitude: -27.5954, longitude: -48.548 },
  { name: "Curitiba", state: "PR", ibgeCode: "4106902", latitude: -25.4284, longitude: -49.2733 },
  { name: "São Paulo", state: "SP", ibgeCode: "3550308", latitude: -23.5505, longitude: -46.6333 },
  { name: "Rio de Janeiro", state: "RJ", ibgeCode: "3304557", latitude: -22.9068, longitude: -43.1729 },
  { name: "Belo Horizonte", state: "MG", ibgeCode: "3106200", latitude: -19.9167, longitude: -43.9345 },
  { name: "Vitória", state: "ES", ibgeCode: "3205309", latitude: -20.3155, longitude: -40.3128 },
  { name: "Brasília", state: "DF", ibgeCode: "5300108", latitude: -15.7942, longitude: -47.8825 },
  { name: "Goiânia", state: "GO", ibgeCode: "5208707", latitude: -16.6864, longitude: -49.2643 },
  { name: "Campo Grande", state: "MS", ibgeCode: "5002704", latitude: -20.4697, longitude: -54.6201 },
  { name: "Cuiabá", state: "MT", ibgeCode: "5103403", latitude: -15.601, longitude: -56.0974 },
  { name: "Salvador", state: "BA", ibgeCode: "2927408", latitude: -12.9714, longitude: -38.5014 },
  { name: "Recife", state: "PE", ibgeCode: "2611606", latitude: -8.0476, longitude: -34.877 },
  { name: "Fortaleza", state: "CE", ibgeCode: "2304400", latitude: -3.7172, longitude: -38.5433 },
  { name: "Belém", state: "PA", ibgeCode: "1501402", latitude: -1.4558, longitude: -48.4902 },
  { name: "Manaus", state: "AM", ibgeCode: "1302603", latitude: -3.119, longitude: -60.0217 },
  { name: "Natal", state: "RN", ibgeCode: "2408102", latitude: -5.7945, longitude: -35.211 },
  { name: "João Pessoa", state: "PB", ibgeCode: "2507507", latitude: -7.1195, longitude: -34.8450 },
  { name: "Maceió", state: "AL", ibgeCode: "2704302", latitude: -9.6498, longitude: -35.7089 },
  { name: "Aracaju", state: "SE", ibgeCode: "2800308", latitude: -10.9472, longitude: -37.0731 },
  { name: "Teresina", state: "PI", ibgeCode: "2211001", latitude: -5.0892, longitude: -42.8019 },
  { name: "São Luís", state: "MA", ibgeCode: "2111300", latitude: -2.5297, longitude: -44.3028 },
  { name: "Palmas", state: "TO", ibgeCode: "1721000", latitude: -10.1689, longitude: -48.3317 },
  { name: "Porto Velho", state: "RO", ibgeCode: "1100205", latitude: -8.7619, longitude: -63.9039 },
  { name: "Rio Branco", state: "AC", ibgeCode: "1200401", latitude: -9.9754, longitude: -67.8249 },
  { name: "Boa Vista", state: "RR", ibgeCode: "1400100", latitude: 2.8235, longitude: -60.6758 },
  { name: "Macapá", state: "AP", ibgeCode: "1600303", latitude: 0.0349, longitude: -51.0694 },
];

function haversineKm(a: CityReference, lat: number, lon: number): number {
  const R = 6371;
  const dLat = ((lat - a.latitude) * Math.PI) / 180;
  const dLon = ((lon - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Arredonda para 1 casa decimal (~11km de precisao) antes de qualquer uso
 * — nunca guarda nem loga a coordenada exata recebida do navegador.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Encontra a capital de referencia mais proxima. Retorna o padrao
 * (Santa Maria) se nenhuma capital estiver a menos de 400km — nesse caso
 * a previsao da capital mais proxima seria enganosa demais para ser util.
 */
export function nearestReferenceCity(latitude: number, longitude: number): CityReference {
  const rounded = { lat: roundCoordinate(latitude), lon: roundCoordinate(longitude) };
  let best = DEFAULT_CITY;
  let bestDistance = haversineKm(DEFAULT_CITY, rounded.lat, rounded.lon);
  for (const city of REFERENCE_CITIES) {
    const distance = haversineKm(city, rounded.lat, rounded.lon);
    if (distance < bestDistance) {
      best = city;
      bestDistance = distance;
    }
  }
  return bestDistance <= 400 ? best : DEFAULT_CITY;
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
