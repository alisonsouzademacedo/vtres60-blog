import { NextResponse } from "next/server";
import { getCachedWeather, nearestReferenceCity, roundCoordinate } from "@/lib/market/weather-provider";

// Fase 8C (secao 12): unica rota server-side que chama o provider de
// clima — nunca chamado direto do componente cliente. So existe porque
// "usar minha localizacao" precisa da coordenada do navegador (so
// disponivel no cliente); o resto do widget (Santa Maria por padrao) usa
// o provider direto de dentro do Server Component, sem passar por rota.
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
  const city = nearestReferenceCity(roundCoordinate(lat), roundCoordinate(lon));
  const { data } = await getCachedWeather(city);
  return NextResponse.json(data);
}
