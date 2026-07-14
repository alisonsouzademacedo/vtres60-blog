import type { Article } from "@/types/content";
import { contentRepository } from "@/services/cms";

// Fase 6 — extraido de taxonomy-page.tsx (arquivo separado, sem JSX, para
// ser testavel via vitest: este projeto nao tem o plugin React configurado
// no vitest.config.ts, entao nenhum arquivo .tsx pode ser importado
// diretamente por um teste). Ver taxonomy-page.tsx para o uso na UI e nas
// rotas categorias/tags/segmentos/[slug]/page.tsx (generateMetadata).
export async function hasTaxonomyMatches(filter: (article: Article) => boolean): Promise<boolean> {
  const articles = await contentRepository.listArticles();
  return articles.some(filter);
}
