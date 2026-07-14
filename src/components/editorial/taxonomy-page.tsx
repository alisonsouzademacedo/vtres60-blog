import type { Article } from "@/types/content";
import { contentRepository } from "@/services/cms";
import { ArticleCard } from "./article-card";
import styles from "./taxonomy-page.module.css";

// hasTaxonomyMatches vive em taxonomy-matches.ts (sem JSX, testavel via
// vitest) — reexportado aqui para as rotas continuarem importando de um
// unico lugar junto com TaxonomyPage.
export { hasTaxonomyMatches } from "./taxonomy-matches";

export async function TaxonomyPage({
  eyebrow,
  title,
  description,
  filter,
}: {
  eyebrow: string;
  title: string;
  description: string;
  filter: (article: Article) => boolean;
}) {
  const articles = await contentRepository.listArticles();
  const matches = articles.filter(filter);

  if (matches.length === 0) {
    return (
      <main id="conteudo" className={styles.main}>
        <header className={`container ${styles.header}`}>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <section className={`container ${styles.empty}`}>
          <p>Ainda não há conteúdos publicados aqui. Novas matérias são publicadas regularmente — volte em breve.</p>
        </section>
      </main>
    );
  }

  return (
    <main id="conteudo" className={styles.main}>
      <header className={`container ${styles.header}`}>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div>
          <b>{matches.length}</b>
          <span>conteúdos selecionados</span>
        </div>
      </header>
      <section className={`container ${styles.grid}`}>
        {matches.map((article) => (
          <ArticleCard article={article} key={article.slug} />
        ))}
      </section>
    </main>
  );
}
