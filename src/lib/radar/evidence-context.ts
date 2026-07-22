import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";
import type { EvidenceContext } from "./validate-signal";

export interface EvidencePostsIndex extends EvidenceContext {
  posts: Map<string, { sourceUrl: string }>;
}

const isVisible = (status: string, scheduledAt: string) => status === "published" || (status === "scheduled" && Boolean(scheduledAt) && new Date(scheduledAt) <= new Date());

export async function buildEvidenceContext(): Promise<EvidencePostsIndex> {
  const [posts, tags, segments, companies] = await Promise.all([
    editorialRepository.listPosts(),
    editorialRepository.listTags(),
    operationsRepository.listSegments(),
    operationsRepository.listCompanies(),
  ]);
  const visiblePosts = posts.filter((post) => isVisible(post.status, post.scheduledAt));
  return {
    postIds: new Set(visiblePosts.map((post) => post.id)),
    tagIds: new Set(tags.map((tag) => tag.id)),
    segmentSlugs: new Set(segments.map((segment) => segment.slug)),
    companySlugs: new Set(companies.map((company) => company.slug)),
    posts: new Map(visiblePosts.map((post) => [post.id, { sourceUrl: post.sourceUrl }])),
  };
}

export function deriveSourceUrls(evidencePostIds: string[], context: EvidencePostsIndex): string[] {
  const urls = evidencePostIds.map((id) => context.posts.get(id)?.sourceUrl).filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}
