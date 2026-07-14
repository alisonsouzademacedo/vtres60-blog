"use client";
import { useEffect, useState } from "react";
import { CONSENT_CHANGED_EVENT, OPEN_CONSENT_PREFERENCES_EVENT, readStoredConsent, writeStoredConsent, type ConsentDecision } from "@/lib/consent";
import styles from "./consent-banner.module.css";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Aplica a decisao de consentimento no Consent Mode v2 do Google (gtag) e
 * dispara um CustomEvent proprio ("vtres60:consent-changed") para
 * componentes nao-Google (Meta Pixel, LinkedIn Insight) reagirem sem
 * depender de uma API especifica do Google. Ver AnalyticsScripts.
 */
function applyConsent(decision: Pick<ConsentDecision, "analytics" | "marketing">) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
  }
  window.gtag("consent", "update", {
    analytics_storage: decision.analytics ? "granted" : "denied",
    ad_storage: decision.marketing ? "granted" : "denied",
    ad_user_data: decision.marketing ? "granted" : "denied",
    ad_personalization: decision.marketing ? "granted" : "denied",
  });
  window.dispatchEvent(
    new CustomEvent<Pick<ConsentDecision, "analytics" | "marketing">>(CONSENT_CHANGED_EVENT, { detail: decision }),
  );
}

export type ConsentChangedEvent = CustomEvent<Pick<ConsentDecision, "analytics" | "marketing">>;

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      applyConsent(stored);
      setOpen(false);
    } else {
      setOpen(true);
    }

    function reopen() {
      const current = readStoredConsent();
      setDraftAnalytics(current?.analytics ?? false);
      setDraftMarketing(current?.marketing ?? false);
      setCustomizing(true);
      setOpen(true);
    }
    window.addEventListener(OPEN_CONSENT_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_PREFERENCES_EVENT, reopen);
  }, []);

  function decide(next: Pick<ConsentDecision, "analytics" | "marketing">) {
    const saved = writeStoredConsent(next);
    applyConsent(saved);
    setOpen(false);
    setCustomizing(false);
  }

  if (!open) return null;

  return (
    <div className={styles.banner} role="dialog" aria-modal="true" aria-label="Preferências de cookies">
      <div className={styles.inner}>
        <p className={styles.text}>
          Usamos cookies necessários ao funcionamento do site e, mediante seu consentimento, cookies de análise e
          marketing para entender o uso do conteúdo e mensurar campanhas. Você pode revisar essa escolha quando
          quiser pelo link &quot;Preferências de cookies&quot; no rodapé.
        </p>

        {customizing && (
          <div className={styles.options}>
            <label className={styles.option}>
              <input type="checkbox" checked disabled /> Necessários (sempre ativos)
            </label>
            <label className={styles.option}>
              <input type="checkbox" checked={draftAnalytics} onChange={(event) => setDraftAnalytics(event.target.checked)} />
              Análise (estatísticas de uso)
            </label>
            <label className={styles.option}>
              <input type="checkbox" checked={draftMarketing} onChange={(event) => setDraftMarketing(event.target.checked)} />
              Marketing (anúncios e mensuração de campanhas)
            </label>
          </div>
        )}

        <div className={styles.actions}>
          {customizing ? (
            <button type="button" className={styles.button} onClick={() => decide({ analytics: draftAnalytics, marketing: draftMarketing })}>
              Salvar preferências
            </button>
          ) : (
            <>
              <button type="button" className={styles.button} onClick={() => decide({ analytics: false, marketing: false })}>
                Recusar
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  const current = readStoredConsent();
                  setDraftAnalytics(current?.analytics ?? false);
                  setDraftMarketing(current?.marketing ?? false);
                  setCustomizing(true);
                }}
              >
                Personalizar
              </button>
              <button type="button" className={styles.button} onClick={() => decide({ analytics: true, marketing: true })}>
                Aceitar tudo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
