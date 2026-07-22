import axios from "axios";

/**
 * Fechamento Fase 8C — resolve a coordenada do usuário para a ESTAÇÃO
 * meteorológica automática ativa mais próxima (catálogo real do INMET),
 * depois converte o nome dessa estação/município para o código IBGE via
 * a API oficial do IBGE, para então chamar o endpoint de previsão que já
 * funciona (`apiprevmet3.inmet.gov.br/previsao/{codigoIbge}`).
 *
 * Por que isso substitui o "capital mais próxima" da primeira versão da
 * Fase 8C: `apiprevmet3.inmet.gov.br/previsao/{codigoIbge}` foi
 * confirmado (por chamada real) funcionando para QUALQUER município,
 * não só capitais (testado com Alvorada/RS e Caxias do Sul/RS, nenhuma
 * capital) — a limitação "só 27 capitais" era um corte de escopo
 * autoimposto, não uma limitação real da API. E o catálogo de estações
 * (`apitempo.inmet.gov.br/estacoes/T`) é um dataset público real com
 * código/nome/latitude/longitude/status de 673 estações (477 ativas
 * confirmadas), exatamente o que permite achar a estação mais próxima de
 * verdade em vez de forçar a coordenada para uma de 27 capitais distantes.
 */

const STATIONS_URL = "https://apitempo.inmet.gov.br/estacoes/T";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface InmetStation {
  code: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

interface RawStation {
  CD_ESTACAO: string;
  DC_NOME: string;
  SG_ESTADO: string;
  VL_LATITUDE: string;
  VL_LONGITUDE: string;
  CD_SITUACAO: string;
}

export async function fetchActiveStations(): Promise<InmetStation[]> {
  try {
    const { status, data } = await axios.get(STATIONS_URL, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (status !== 200 || !Array.isArray(data)) return [];
    return (data as RawStation[])
      .filter((s) => s.CD_SITUACAO === "Operante")
      .map((s) => ({ code: s.CD_ESTACAO, name: s.DC_NOME, state: s.SG_ESTADO, latitude: Number(s.VL_LATITUDE), longitude: Number(s.VL_LONGITUDE), active: true }));
  } catch {
    return [];
  }
}

// Catalogo de estacoes muda raramente (instalacao/desativacao fisica) —
// TTL de 24h evita bater na API a cada resolucao de localizacao.
const STATIONS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let stationsCache: { data: InmetStation[]; expiresAt: number } | undefined;

async function getCachedStations(): Promise<InmetStation[]> {
  const now = Date.now();
  if (stationsCache && stationsCache.expiresAt > now) return stationsCache.data;
  const data = await fetchActiveStations();
  stationsCache = { data, expiresAt: now + STATIONS_CACHE_TTL_MS };
  return data;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Distância máxima aceitável para considerar uma estação "coerentemente
 * próxima" (spec: seção 3). 477 estações ativas cobrem o território de
 * forma desigual (mais densas no Sul/Sudeste); 50km é conservador o
 * bastante para não apresentar uma estação distante como se fosse local.
 */
export const MAX_STATION_DISTANCE_KM = 50;

export function nearestActiveStation(
  stations: InmetStation[],
  latitude: number,
  longitude: number,
  maxDistanceKm: number = MAX_STATION_DISTANCE_KM,
): { station: InmetStation; distanceKm: number } | null {
  let best: { station: InmetStation; distanceKm: number } | null = null;
  for (const station of stations) {
    const distanceKm = haversineKm(latitude, longitude, station.latitude, station.longitude);
    if (!best || distanceKm < best.distanceKm) best = { station, distanceKm };
  }
  if (!best || best.distanceKm > maxDistanceKm) return null;
  return best;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

// Lista de municipios por UF muda raramente (so em criacao/fusao de
// municipio, evento raríssimo) — cache longo, por estado.
const IBGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ibgeCacheByState = new Map<string, { data: { id: number; nome: string }[]; expiresAt: number }>();

async function resolveIbgeCode(stationName: string, state: string): Promise<string | null> {
  const now = Date.now();
  const cached = ibgeCacheByState.get(state);
  let municipios = cached && cached.expiresAt > now ? cached.data : undefined;
  if (!municipios) {
    try {
      const { status, data } = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios`, { timeout: 10_000 });
      if (status !== 200 || !Array.isArray(data)) return null;
      municipios = data as { id: number; nome: string }[];
      ibgeCacheByState.set(state, { data: municipios, expiresAt: now + IBGE_CACHE_TTL_MS });
    } catch {
      return null;
    }
  }
  const match = municipios.find((m) => normalizeName(m.nome) === normalizeName(stationName));
  return match ? String(match.id) : null;
}

export interface ResolvedLocation {
  city: { name: string; state: string; ibgeCode: string };
  stationName: string;
  distanceKm: number;
}

/**
 * Fluxo completo: coordenada -> estação ativa mais próxima -> código IBGE
 * real -> pronto para alimentar o provider de clima existente. Retorna
 * `null` quando qualquer etapa não puder ser confirmada com segurança —
 * nunca "adivinha" uma cidade.
 */
export async function resolveLocationToCity(latitude: number, longitude: number): Promise<ResolvedLocation | null> {
  const stations = await getCachedStations();
  const nearest = nearestActiveStation(stations, latitude, longitude);
  if (!nearest) return null;

  const ibgeCode = await resolveIbgeCode(nearest.station.name, nearest.station.state);
  if (!ibgeCode) return null;

  return {
    city: { name: toTitleCase(nearest.station.name), state: nearest.station.state, ibgeCode },
    stationName: nearest.station.name,
    distanceKm: Math.round(nearest.distanceKm * 10) / 10,
  };
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (["de", "da", "do", "das", "dos", "e"].includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function _resetStationCacheForTests() {
  stationsCache = undefined;
  ibgeCacheByState.clear();
}
