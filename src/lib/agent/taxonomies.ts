// Fase 3 — acesso as taxonomias reais de runtime (categorias, tags,
// empresas com hub editorial) para o Drafter/InternalAuditor/Publisher.
//
// Fonte canonica confirmada por inspecao (relatorio da Fase 3):
// - categorias: editorialRepository.listCategories() -> public.categories
//   (13 categorias reais, com id/name/slug/description ja populados).
// - tags: editorialRepository.listTags() -> public.tags (16 tags reais,
//   mesma forma de campos).
// - hubs de empresa: contentRepository NAO usa Supabase para isso — os
//   hubs de /empresas vem de um array estatico em src/data/content.ts
//   (companies: Company[]), e a associacao real (empresas/[slug]/page.tsx)
//   e por NOME EXATO (article.companies.includes(company.name)), nao por
//   id/slug. Por isso a fonte canonica de "hub valido" aqui e esse mesmo
//   array, e a representacao usada e o nome exato da empresa.
import { companies as companyHubs } from "@/data/content";
import { editorialRepository } from "@/services/editorial";

export interface ValidCategory {
  id: string;
  name: string;
  description: string;
}

export interface ValidTag {
  id: string;
  name: string;
}

export interface ValidCompanyHub {
  name: string;
}

export async function loadValidCategories(): Promise<ValidCategory[]> {
  const categories = await editorialRepository.listCategories();
  return categories.map((category) => ({ id: category.id, name: category.name, description: category.description }));
}

export async function loadValidTags(): Promise<ValidTag[]> {
  const tags = await editorialRepository.listTags();
  return tags.map((tag) => ({ id: tag.id, name: tag.name }));
}

export function loadValidCompanyHubs(): ValidCompanyHub[] {
  return companyHubs.map((company) => ({ name: company.name }));
}

export function isValidCategoryId(categoryId: string, validCategories: ValidCategory[]): boolean {
  return validCategories.some((category) => category.id === categoryId);
}

export interface FilterResult {
  valid: string[];
  rejected: string[];
}

export function filterValidTagIds(tagIds: string[], validTags: ValidTag[]): FilterResult {
  const validIds = new Set(validTags.map((tag) => tag.id));
  return {
    valid: tagIds.filter((id) => validIds.has(id)),
    rejected: tagIds.filter((id) => !validIds.has(id)),
  };
}

export function filterValidCompanies(names: string[], validHubs: ValidCompanyHub[]): FilterResult {
  const validNames = new Set(validHubs.map((hub) => hub.name));
  return {
    valid: names.filter((name) => validNames.has(name)),
    rejected: names.filter((name) => !validNames.has(name)),
  };
}

export function formatCategoriesForPrompt(categories: ValidCategory[]): string {
  return categories.map((category) => `- ${category.id}: ${category.name}${category.description ? ` — ${category.description}` : ""}`).join("\n");
}

export function formatTagsForPrompt(tags: ValidTag[]): string {
  return tags.map((tag) => `- ${tag.id}: ${tag.name}`).join("\n");
}

export function formatCompanyHubsForPrompt(hubs: ValidCompanyHub[]): string {
  return hubs.map((hub) => `- ${hub.name}`).join("\n");
}
