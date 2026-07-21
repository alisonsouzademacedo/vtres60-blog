import { NextResponse } from "next/server";
import { resolveLocationToCity } from "@/lib/market/inmet-stations";
import { DEFAULT_CITY, getCachedWeather, roundCoordinate } from "@/lib/market/weather-provider";

// Fechamento Fase 8C — unica rota server-side que chama os providers de
// clima/localizacao — nunca chamado direto do componente cliente. So
// existe porque "usar minha localizacao" precisa da coordenada do
// navegador (so disponivel no cliente); o resto do widget (Santa Maria
// por padrao) usa o provider direto de dentro do Server Component.
//
// Substitui o mapeamento "capital mais proxima" da primeira versao desta
// fase: agora resolve para a ESTACAO AUTOMATICA ATIVA real mais proxima
// (catalogo do INMET), nunca uma capital distante apresentada como se
// fosse a localizacao do usuario. Ver src/lib/market/inmet-stations.ts.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lonParam = url.searchParams.get("lon");

  if (!latParam || !lonParam) {
    const { data } = await getCachedWeather();
    return NextResponse.json(data);
  }

  const lat = Number(latParam);
  const lon = Number(lonParam);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
  }

  // Arredonda antes de qualquer uso — nunca loga nem repassa a coordenada exata do navegador.
  const resolved = await resolveLocationToCity(roundCoordinate(lat), roundCoordinate(lon));

  if (!resolved) {
    // Nenhuma estação ativa coerentemente próxima (seção 5): não escolher
    // uma capital arbitrária — volta para Santa Maria com aviso explícito.
    const { data } = await getCachedWeather(DEFAULT_CITY);
    return NextResponse.json({ ...data, locationFallback: true });
  }

  const { data } = await getCachedWeather(resolved.city);
  return NextResponse.json({ ...data, stationName: resolved.stationName, distanceKm: resolved.distanceKm });
}
