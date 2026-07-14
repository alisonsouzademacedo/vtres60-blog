// Fase 6 — consentimento LGPD (Secao 21). Duas categorias opcionais
// (analytics/marketing); "necessarios" nao existe como opt-out aqui porque
// hoje nao ha nenhum script realmente necessario que dependa de consentimento
// (sessao do admin usa cookie httpOnly, fora do escopo deste banner).
export interface ConsentDecision {
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

// Exportado (nao apenas privado) porque o script inline de Consent Mode
// (consent-mode-init.tsx) precisa da MESMA chave para ler o localStorage
// antes da hidratacao do React — interpolar a constante evita as duas
// copias divergirem silenciosamente.
export const CONSENT_STORAGE_KEY = "vtres60_consent_v1";

// Nome do evento global disparado quando o usuario pede para revisar as
// preferencias de novo (ex: link "Preferências de cookies" no footer) —
// ConsentBanner escuta isso para reabrir o modal mesmo depois de decidido.
export const OPEN_CONSENT_PREFERENCES_EVENT = "vtres60:open-consent-preferences";

// Disparado (CustomEvent<Pick<ConsentDecision,"analytics"|"marketing">>)
// sempre que o usuario decide/atualiza o consentimento — componentes
// nao-Google (Meta Pixel, LinkedIn Insight) escutam isso em vez de
// depender da API gtag do Consent Mode, que e Google-specific.
export const CONSENT_CHANGED_EVENT = "vtres60:consent-changed";

function isValidDecision(value: unknown): value is ConsentDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.analytics === "boolean" && typeof candidate.marketing === "boolean" && typeof candidate.decidedAt === "string";
}

export function readStoredConsent(): ConsentDecision | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isValidDecision(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredConsent(decision: Pick<ConsentDecision, "analytics" | "marketing">): ConsentDecision {
  const full: ConsentDecision = { ...decision, decidedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(full));
    } catch {
      // Storage indisponivel (modo privado/quota) — decisao ainda vale para
      // a sessao atual via estado em memoria do ConsentBanner; so nao
      // persiste entre visitas. Nao e um erro que deva quebrar a pagina.
    }
  }
  return full;
}
