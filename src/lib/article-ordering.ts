// Logica pura de ordenacao cronologica e resolucao do destaque editorial manual.
// Extraida para modulo proprio (sem imports de React/CSS/Supabase) para ser
// testavel isoladamente. Nao usa featured/mainStory/displayOrder: esses campos
// continuam existindo no schema e no admin, mas nao devem mais decidir a
// ordem global do feed publico nem prender o hero indefinidamente.

/**
 * Ordena por criacao mais recente primeiro (created_at DESC).
 * Ver docs/backup-fase1-remocoes-2026-07-09.json e relatorio da Fase 1 para o
 * porque de created_at (e nao published_at) ser o criterio adotado.
 */
export function compareByRecency(a: { createdAt: string }, b: { createdAt: string }): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Resolve o artigo em destaque na home:
 * - se leadArticleSlug apontar para um artigo presente em `articles` (ja
 *   filtrado para o conjunto publico elegivel), esse artigo vence;
 * - caso contrario (slug vazio, invalido ou artigo indisponivel), usa o
 *   primeiro item de `articles` — que deve chegar aqui pre-ordenado por
 *   compareByRecency, portanto o mais recente.
 */
export function resolveLeadArticle<T extends { slug: string }>(
  articles: T[],
  leadArticleSlug: string,
): T | undefined {
  return articles.find((article) => article.slug === leadArticleSlug) ?? articles[0];
}
