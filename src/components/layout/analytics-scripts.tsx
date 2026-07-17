"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SeoSettings } from "@/types/admin";
import { CONSENT_CHANGED_EVENT, readStoredConsent, type ConsentDecision } from "@/lib/consent";
import { isAdminRoute, sanitizePixelId, shouldLoadMetaPixel } from "./meta-pixel-gate";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const safeId = sanitizePixelId;

/**
 * Fase 6 (Secao 18-22) — reescrita da injecao de tags de terceiros:
 *
 * 1. GTM, quando configurado, e o UNICO orquestrador: GA4/Google Ads
 *    diretos (gtag) sao pulados aqui — devem ser configurados DENTRO do
 *    proprio GTM. Carregar os dois ao mesmo tempo duplicaria pageviews e
 *    conversoes (Secao 18).
 * 2. Sem GTM, GA4 e Google Ads compartilham UM UNICO bootstrap gtag.js
 *    (mesmo <script src>, duas chamadas gtag('config',...)) — nunca dois
 *    <script src="gtag/js?id=..."> separados, que reatribuiriam
 *    window.gtag duas vezes.
 * 3. Meta Pixel e LinkedIn Insight so carregam depois de consentimento de
 *    marketing (Consent Mode v2 cobre Google; estes dois nao sao Google,
 *    entao dependem do CustomEvent proprio disparado por ConsentBanner).
 * 3b. (Fase 7) `seo.metaPixelManagedByGtm` — quando true, o Pixel NAO e
 *    carregado por este componente (fica a cargo do proprio GTM). Existe
 *    para permitir migrar a gestao do Pixel para dentro do GTM no futuro
 *    sem duplicar PageView por um periodo (ver hint no admin/SEO).
 * 4. Meta Pixel: o bootstrap inline ja dispara o primeiro PageView; o
 *    efeito abaixo cobre navegacoes client-side subsequentes do App
 *    Router (sem isso, paginas vistas via <Link> nunca seriam contadas —
 *    o script so roda uma vez, no mount do layout raiz).
 */
export function AnalyticsScripts({ seo }: { seo: SeoSettings }) {
  const pathname = usePathname();
  const [marketingConsent, setMarketingConsent] = useState(false);

  useEffect(() => {
    setMarketingConsent(readStoredConsent()?.marketing ?? false);
    function onConsentChanged(event: Event) {
      const detail = (event as CustomEvent<Pick<ConsentDecision, "analytics" | "marketing">>).detail;
      setMarketingConsent(detail.marketing);
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChanged);
  }, []);

  // Fase 7 (Secao 44 fix) — next/script nunca dispara onLoad para scripts
  // INLINE (sem src): o bootstrap do Pixel cria o <script src=fbevents.js>
  // sozinho via DOM, fora do controle do next/script, entao o proprio
  // onLoad do componente Script nunca chamava de volta (ficava travado em
  // "nao pronto" para sempre, mesmo com o Pixel de fato ativo) — nenhum
  // PageView de navegacao SPA disparava depois do primeiro. Checar
  // window.fbq diretamente reflete o estado real em vez de um callback que
  // nunca chega.
  useEffect(() => {
    if (!marketingConsent || typeof window.fbq !== "function") return;
    window.fbq("track", "PageView");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isAdminRoute(pathname)) return null;

  const gtm = safeId(seo.googleTagManagerId);
  const ga = gtm ? "" : safeId(seo.googleAnalyticsId);
  const ads = gtm ? "" : safeId(seo.googleAdsId);
  const pixelAllowed = shouldLoadMetaPixel({
    metaPixelId: seo.metaPixelId,
    metaPixelManagedByGtm: seo.metaPixelManagedByGtm,
    marketingConsent,
    pathname,
  });
  const pixel = pixelAllowed ? safeId(seo.metaPixelId) : "";
  const linkedin = safeId(seo.linkedinPartnerId);
  const gtagBootstrapId = ga || ads;

  return (
    <>
      {gtm && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}

      {gtagBootstrapId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagBootstrapId}`} strategy="afterInteractive" />
          <Script id="gtag-config" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('js',new Date());${ga ? `gtag('config','${ga}');` : ""}${ads ? `gtag('config','${ads}');` : ""}`}
          </Script>
        </>
      )}

      {pixel && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}

      {linkedin && marketingConsent && (
        <Script id="linkedin-insight" strategy="afterInteractive">
          {`_linkedin_partner_id='${linkedin}';window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName('script')[0];var b=document.createElement('script');b.type='text/javascript';b.async=true;b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';s.parentNode.insertBefore(b,s)})(window.lintrk);`}
        </Script>
      )}
    </>
  );
}
