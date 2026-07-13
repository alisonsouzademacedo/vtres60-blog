import type { Article } from "@/types/content";
import { contentRepository } from "@/services/cms";
import { ArticleCard } from "./article-card";
import styles from "./taxonomy-page.module.css";

export async function TaxonomyPage({ eyebrow, title, description, filter }: { eyebrow: string; title: string; description: string; filter: (article: Article) => boolean }) {
  const articles = await contentRepository.listArticles();
  const matches=articles.filter(filter); const content=matches.length?matches:articles.slice(0,4);
  return <main id="conteudo" className={styles.main}><header className={`container ${styles.header}`}><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p><div><b>{matches.length || content.length}</b><span>conteúdos selecionados</span></div></header><section className={`container ${styles.grid}`}>{content.map(article=><ArticleCard article={article} key={article.slug}/>)}</section></main>;
}
