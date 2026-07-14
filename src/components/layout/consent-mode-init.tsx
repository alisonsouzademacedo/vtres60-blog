import Script from "next/script";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

/**
 * Consent Mode v2 (Fase 6, Secao 21): estabelece o estado DEFAULT negado
 * ANTES de qualquer script do Google (GTM/gtag) carregar — exigencia
 * oficial do Google para Consent Mode v2 funcionar corretamente (o default
 * precisa existir antes do proprio gtag.js/gtm.js rodar, nao depois).
 * `strategy="beforeInteractive"` e o unico modo do next/script que garante
 * isso (injeta no <head>, executa antes da hidratacao).
 *
 * Roda em TODA pagina, mesmo sem nenhum Google Tag configurado ainda —
 * e barato (poucas linhas, sem rede) e evita ter que lembrar de adicionar
 * isso depois quando o gestor de trafego finalmente configurar a tag.
 *
 * Reaplica a decisao ja salva (se houver) na hora, para nao esperar o
 * ConsentBanner hidratar — sem isso, um visitante que ja aceitou analytics
 * veria o Consent Mode negado por alguns milissegundos extras a cada nova
 * pagina.
 */
export function ConsentModeInit() {
  const script = `window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});try{var s=JSON.parse(window.localStorage.getItem('${CONSENT_STORAGE_KEY}')||'null');if(s&&typeof s.analytics==='boolean'&&typeof s.marketing==='boolean'){gtag('consent','update',{analytics_storage:s.analytics?'granted':'denied',ad_storage:s.marketing?'granted':'denied',ad_user_data:s.marketing?'granted':'denied',ad_personalization:s.marketing?'granted':'denied'})}}catch(e){}`;

  return (
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document -- regra criada para Pages Router (pages/_document.js); no App Router, o root layout (app/layout.tsx) é o local oficialmente recomendado pela própria documentação do Next.js para beforeInteractive.
    <Script id="consent-mode-init" strategy="beforeInteractive">
      {script}
    </Script>
  );
}
