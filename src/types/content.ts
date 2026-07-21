export type ContentType = "noticia" | "analise" | "guia" | "case";

export interface Author {
  name: string;
  slug: string;
  role: string;
}

export interface Article {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  excerpt: string;
  impact: string;
  category: string;
  categorySlug: string;
  segments: string[];
  companies: string[];
  tags: string[];
  image: string;
  imageAlt: string;
  author: Author;
  publishedAt: string;
  updatedAt?: string;
  readingTime: number;
  featured?: boolean;
  mostRead?: number;
  body: string[];
  content?: string;
  imageCaption?: string;
  // Fase 4 — credito da imagem editorial (fotografo/fonte real, quando
  // detectado). Ausente/undefined em posts historicos e sempre que a
  // pipeline nao encontrou um sinal confiavel — nunca inferido.
  imageCredit?: string;
  sourceName?: string;
  sourceUrl?: string;
  educational?: boolean;
  seo?: { metaTitle:string;metaDescription:string;keywords:string[];ogImage:string;canonical:string;schemaType:"Article"|"NewsArticle"|"BlogPosting" };
  faq?: Array<{question:string;answer:string}>;
  cta?: {label:string;url:string;text:string};
}

export interface Company {
  name: string;
  slug: string;
  ticker?: string;
  sector: string;
  description: string;
  accent: string;
}

export interface IndustrialEvent {
  id?: string;
  title: string;
  slug: string;
  date: string;
  month: string;
  location: string;
  segment: string;
  image: string;
  imageAlt: string;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  expectedAudience: string;
  exhibitors: string;
  description: string;
  whyFollow: string[];
  opportunities: string[];
  ctaUrl: string;
  dataStatus: "official_verified" | "manual_verified" | "unverified";
  additionalImages?: string[];
  city?: string;
  state?: string;
  status?: "candidate" | "verified" | "published" | "archived" | "cancelled";
  showOnHome?: boolean;
  displayOrder?: number;
  relatedEventIds?: string[];
  ctaLabel?: string;
}

export interface SegmentProfile {
  name: string;
  slug: string;
  image: string;
  imageAlt: string;
  articleCount: number;
  description?: string;
  icon?: string;
  order?: number;
  showOnHome?: boolean;
  metaTitle?: string;
  metaDescription?: string;
}
