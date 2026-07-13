import type { ContentType } from "@/types/content";

export type PublicationStatus = "draft" | "published" | "scheduled";
export interface SeoEntry {
  metaTitle: string; metaDescription: string; keywords: string[]; ogImage: string;
  canonical: string; schemaType: "Article" | "NewsArticle" | "BlogPosting";
  // Selo/overlay do logo da empresa foco da materia (Agente Autonomo),
  // resolvido via Clearbit Logo API. Opcional: nem toda materia tem uma
  // empresa especifica identificavel. Guardado aqui (JSONB) em vez de
  // coluna propria — sem migracao de schema necessaria.
  companyLogoUrl?: string;
}
export interface FaqEntry { question: string; answer: string }
export interface CtaEntry { label: string; url: string; text: string }

// image_origin controlado — ver supabase-image-metadata-schema.sql. Nao
// inclui "placeholder": via.placeholder.com foi removido (Fase 4), e uma
// noticia sem imagem aprovada nao e publicada (image_pipeline_failed).
export type ImageOrigin = "source_og" | "generated_replicate" | "pexels" | "owned";

export interface ManagedPost {
  id: string; title: string; slug: string; excerpt: string; content: string;
  featuredImage: string; imageCaption: string; imageAlt: string;
  categoryId: string; segmentSlugs: string[]; tagIds: string[]; authorId: string;
  publishedAt: string; scheduledAt: string; readingTime: number; status: PublicationStatus;
  featured: boolean; mainStory: boolean; displayOrder: number;
  sourceName: string; sourceUrl: string; contentType: ContentType;
  impact: string; companies: string[]; cta: CtaEntry; seo: SeoEntry; faq: FaqEntry[];
  // Fase 4 — provenance da imagem editorial. Opcionais/undefined em posts
  // historicos (criados antes da migracao) — nunca preenchidos
  // retroativamente por inferencia. Ver supabase-image-metadata-schema.sql.
  imageSourceUrl?: string; imageCredit?: string; imageOrigin?: ImageOrigin;
  imageHash?: string; imageWidth?: number; imageHeight?: number;
  createdAt: string; updatedAt: string;
}

export interface EducationalArticle {
  id: string; title: string; slug: string; excerpt: string; content: string;
  featuredImage: string; imageAlt: string; categoryId: string; tagIds: string[];
  primaryKeyword: string; secondaryKeywords: string[]; authorId: string;
  readingTime: number; status: PublicationStatus; publishedAt: string; scheduledAt: string;
  relatedArticleIds: string[]; relatedPillarSlugs: string[]; cta: CtaEntry;
  seo: SeoEntry; faq: FaqEntry[]; createdAt: string; updatedAt: string;
}

export interface ManagedCategory {
  id: string; name: string; slug: string; description: string; image: string; icon: string;
  color: string; menuOrder: number; showInMenu: boolean; showOnHome: boolean;
  metaTitle: string; metaDescription: string; keywords: string[]; seoIntroduction: string;
  relatedArticleIds: string[]; relatedPillarSlugs: string[];
  page?: {
    h1: string; introduction: string; seoDescription: string; newsSlugs: string[];
    educationalArticleSlugs: string[]; pillarSlugs: string[]; cta: CtaEntry; faq: FaqEntry[];
  };
  createdAt: string; updatedAt: string;
}

export interface ManagedAuthor {
  id: string; name: string; role: string; photo: string; bio: string; linkedin: string;
  email: string; slug: string; createdAt: string; updatedAt: string;
}

export interface ManagedTag {
  id: string; name: string; slug: string; description: string;
  metaTitle: string; metaDescription: string; createdAt: string; updatedAt: string;
}

export type EditorialCollection = "posts" | "educational-articles" | "categories" | "authors" | "tags";
