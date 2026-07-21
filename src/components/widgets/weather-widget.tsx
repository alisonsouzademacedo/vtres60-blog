"use client";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/paths";
import { AlertTriangle, CloudSun, MapPin } from "@/components/ui/icons";
import type { WeatherSnapshot } from "@/lib/market/weather-provider";
import styles from "./market-weather.module.css";

/**
 * Fase 8C (secao 6) — "usar minha localizacao" e sempre uma ACAO do
 * usuario (botao), nunca automatica. Preferencia fica so no navegador
 * (localStorage) — nunca no Supabase, nunca em analytics. Sempre permite
 * voltar para Santa Maria (padrao).
 */
const STORAGE_KEY = "vtres60:weather-location";

type LocationPreference = { source: "default" } | { source: "geolocation"; lat: number; lon: number };

function readStoredPreference(): LocationPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { source: "default" };
    const parsed = JSON.parse(raw) as LocationPreference;
    return parsed.source === "geolocation" ? parsed : { source: "default" };
  } catch {
    return { source: "default" };
  }
}

export function WeatherWidget({ initial }: { initial: WeatherSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [locationState, setLocationState] = useState<"idle" | "requesting" | "denied" | "error">("idle");

  useEffect(() => {
    const preference = readStoredPreference();
    if (preference.source === "geolocation") void fetchForCoordinates(preference.lat, preference.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchForCoordinates(lat: number, lon: number) {
    try {
      const response = await fetch(withBasePath(`/api/market/weather?lat=${lat}&lon=${lon}`));
      if (!response.ok) throw new Error("Falha ao buscar clima para esta localização.");
      setSnapshot(await response.json());
    } catch {
      setLocationState("error");
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }
    setLocationState("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: "geolocation", lat: latitude, lon: longitude }));
        setLocationState("idle");
        void fetchForCoordinates(latitude, longitude);
      },
      (error) => {
        setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      { timeout: 10_000 },
    );
  }

  function useSantaMaria() {
    localStorage.removeItem(STORAGE_KEY);
    setLocationState("idle");
    setSnapshot(initial);
  }

  const isDefaultCity = snapshot.city === "Santa Maria" && snapshot.state === "RS";

  return (
    <aside className={styles.weather}>
      {snapshot.freshnessStatus === "unavailable" ? (
        <div className={styles.weatherUnavailable}>
          <AlertTriangle size={22} />
          <span>Clima indisponível no momento</span>
        </div>
      ) : (
        <>
          <div>
            <CloudSun size={32} />
            <span>
              {snapshot.city}, {snapshot.state}
              <small>{snapshot.condition || "Condição não informada"}</small>
            </span>
          </div>
          <strong>{snapshot.temperatureMax != null ? `${snapshot.temperatureMax}°` : "—"}</strong>
          <footer>
            Máx. {snapshot.temperatureMax ?? "—"}° <i /> Mín. {snapshot.temperatureMin ?? "—"}°
          </footer>
        </>
      )}
      <p className={styles.weatherSource}>
        {snapshot.sourceName} · previsão, não leitura ao vivo
      </p>
      <div className={styles.weatherActions}>
        <button type="button" onClick={useMyLocation} disabled={locationState === "requesting"}>
          <MapPin size={12} /> {locationState === "requesting" ? "Localizando..." : "Usar minha localização"}
        </button>
        {!isDefaultCity && (
          <button type="button" onClick={useSantaMaria}>
            Voltar para Santa Maria
          </button>
        )}
      </div>
      {locationState === "denied" && <small className={styles.weatherHint}>Permissão de localização negada — usando {isDefaultCity ? "Santa Maria" : `${snapshot.city}`}.</small>}
      {locationState === "error" && <small className={styles.weatherHint}>Não foi possível obter sua localização agora.</small>}
    </aside>
  );
}
