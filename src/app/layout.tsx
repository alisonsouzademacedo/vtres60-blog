import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AnalyticsScripts } from "@/components/layout/analytics-scripts";
import { configRepository } from "@/services/config";
import { editorialRepository } from "@/services/editorial";

export async function generateMetadata():Promise<Metadata>{const[settings,seo,branding]=await Promise.all([configRepository.getSettings(),configRepository.getSeo(),configRepository.getBranding()]);return{metadataBase:new URL(seo.canonicalBaseUrl),title:{default:seo.defaultTitle,template:`%s | ${settings.portalName}`},description:seo.defaultDescription,keywords:seo.defaultKeywords,alternates:{canonical:"/"},icons:{icon:branding.favicon},openGraph:{type:"website",locale:"pt_BR",siteName:settings.portalName,title:seo.defaultTitle,description:seo.defaultDescription,images:[seo.defaultOgImage||branding.defaultShareImage]},twitter:{card:"summary_large_image",title:seo.defaultTitle,description:seo.defaultDescription,images:[seo.defaultOgImage||branding.defaultShareImage]},robots:seo.robotsEnabled?{index:true,follow:true}:{index:false,follow:false}}}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const[settings,seo,branding,categories]=await Promise.all([configRepository.getSettings(),configRepository.getSeo(),configRepository.getBranding(),editorialRepository.listCategories()]);
  const organizationId=`${seo.organization.url}/#organization`,websiteId=`${seo.canonicalBaseUrl}/#website`;
  const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": organizationId, name: seo.organization.name, description:seo.organization.description,url:seo.organization.url,logo:seo.organization.logo }, { "@type": "WebSite", "@id": websiteId, name: settings.portalName, url: seo.canonicalBaseUrl, publisher: { "@id": organizationId }, potentialAction: { "@type": "SearchAction", target: `${seo.canonicalBaseUrl}/buscar?q={search_term_string}`, "query-input": "required name=search_term_string" } }] };
  const style={"--blue":branding.colors.primary,"--violet":branding.colors.secondary,"--cyan":branding.colors.accent,"--bg":branding.colors.darkBackground,"--brand-light-bg":branding.colors.lightBackground,"--brand-button":branding.colors.button,"--brand-link":branding.colors.link,"--card-radius":`${branding.cardRadius}px`,"--font-body":branding.typography.body,"--font-heading":branding.typography.headings} as CSSProperties;
  return <html lang="pt-BR"><body style={style}><div className="site-header-shell"><Header settings={settings} branding={branding} categories={categories}/></div>{children}<div className="site-footer-shell"><Footer settings={settings} branding={branding}/></div><AnalyticsScripts seo={seo}/><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} /></body></html>;
}
