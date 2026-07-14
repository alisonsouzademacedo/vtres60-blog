"use client";
import { OPEN_CONSENT_PREFERENCES_EVENT } from "@/lib/consent";

/**
 * Permite revisar a decisão de cookies depois de já ter decidido (Fase 6,
 * Secao 21: "permitir revisão posterior") — sem isso, o ConsentBanner só
 * apareceria uma vez, na primeira visita, sem forma de mudar de ideia.
 */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_PREFERENCES_EVENT))}
      style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", textDecoration: "underline", cursor: "pointer" }}
    >
      Preferências de cookies
    </button>
  );
}
