import type { Article, Company, IndustrialEvent, SegmentProfile } from "@/types/content";

export interface ContentRepository {
  listArticles(): Promise<Article[]>;
  getArticleBySlug(slug: string): Promise<Article | undefined>;
  listCompanies(): Promise<Company[]>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  listEvents(): Promise<IndustrialEvent[]>;
  listSegments(): Promise<string[]>;
  listSegmentProfiles(): Promise<SegmentProfile[]>;
}
