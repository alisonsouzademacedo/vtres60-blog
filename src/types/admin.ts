export interface NavigationLink { label: string; url: string }
export interface SocialLink extends NavigationLink { network: string }
export interface FooterColumn { title: string; links: NavigationLink[] }

export interface PortalSettings {
  portalName: string;
  subtitle: string;
  slogan: string;
  institutionalDescription: string;
  primaryUrl: string;
  contactEmail: string;
  phone: string;
  socialLinks: SocialLink[];
  footerText: string;
  footerNote: string;
  menuLinks: NavigationLink[];
  footerColumns: FooterColumn[];
  headerButton: NavigationLink;
}

export interface BrandingSettings {
  logoPrimary: string;
  logoDark: string;
  favicon: string;
  compactMark: string;
  defaultShareImage: string;
  colors: {
    primary: string; secondary: string; accent: string; lightBackground: string;
    darkBackground: string; button: string; link: string;
  };
  typography: { body: string; headings: string };
  cardRadius: number;
  shadowIntensity: "soft" | "medium" | "strong";
}

export interface SeoSettings {
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string[];
  defaultOgImage: string;
  canonicalBaseUrl: string;
  robotsEnabled: boolean;
  sitemapEnabled: boolean;
  googleAnalyticsId: string;
  googleTagManagerId: string;
  // Fase 6 — Google Ads (AW-XXXXXXXXX) e verificacao do Search Console,
  // pedidos pela auditoria de Analytics/SEO. Strings vazias == nao
  // configurado (mesmo padrao dos IDs acima).
  googleAdsId: string;
  googleSiteVerification: string;
  metaPixelId: string;
  // Fase 7 — quando true, o Pixel acima deve ser gerenciado DENTRO do GTM
  // em vez de carregado diretamente por este componente; evita PageView
  // duplicado caso o gestor de tráfego também cadastre o mesmo Pixel no GTM.
  metaPixelManagedByGtm: boolean;
  linkedinPartnerId: string;
  organization: { name: string; description: string; url: string; logo: string };
}

export interface HomeSettings {
  hero: {
    enabled: boolean; title: string; highlightedText: string; subtitle: string;
    primaryButton: NavigationLink; secondaryButton: NavigationLink;
    searchPlaceholder: string; visual: string; background: string; textColor: string;
    showSubtitle: boolean; showSearch: boolean; showPrimaryButton: boolean; showSecondaryButton: boolean;
  };
  featured: {
    enabled: boolean; eyebrow: string; title: string; subtitle: string; leadArticleSlug: string;
    sideArticleSlugs: string[]; button: NavigationLink;
  };
  latest: {
    enabled: boolean; eyebrow: string; title: string; subtitle: string; postCount: number;
    categoryFilter: string; order: "newest" | "oldest" | "popular"; layout: "editorial" | "grid";
  };
  segments: {
    enabled: boolean; eyebrow: string; title: string; subtitle: string; order: string[];
    theme: "dark" | "light";
  };
  agenda: {
    enabled: boolean; eyebrow: string; title: string; subtitle: string; eventCount: number;
    cta: NavigationLink;
  };
  newsletter: {
    enabled: boolean; eyebrow: string; title: string; description: string; benefits: string[];
    fields: Array<{ name: string; label: string; type: string; placeholder: string; required: boolean }>;
    buttonText: string; successMessage: string;
  };
  modules: {
    radar: boolean; segmentFilter: boolean; intelligence: boolean; analysis: boolean;
    companies: boolean; market: boolean;
  };
}

export type ConfigName = "settings" | "branding" | "seo" | "home";
export interface ConfigMap { settings: PortalSettings; branding: BrandingSettings; seo: SeoSettings; home: HomeSettings }
