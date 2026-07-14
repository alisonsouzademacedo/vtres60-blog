import { contentRepository } from "@/services/cms";
import { ArticleCard } from "@/components/editorial/article-card";
import { Search } from "@/components/ui/icons";
import styles from "./search.module.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q = "" }, articles] = await Promise.all([searchParams, contentRepository.listArticles()]);
  const term = q.toLocaleLowerCase("pt-BR");
  const results = term ? articles.filter((article) => [article.title, article.excerpt, article.category, ...article.tags, ...article.segments, ...article.companies].join(" ").toLocaleLowerCase("pt-BR").includes(term)) : articles;
  return <main id="conteudo" className={styles.main}><div className="container"><span className="eyebrow">Busca editorial</span><h1>O que você quer entender?</h1><form><Search/><input name="q" defaultValue={q} placeholder="Notícias, empresas, tecnologias..." aria-label="Buscar notícias, empresas ou tecnologias" autoFocus/><button>Pesquisar</button></form><p className={styles.count}>{q ? `${results.length} resultado(s) para “${q}”` : "Explore os conteúdos mais recentes"}</p><div className={styles.grid}>{results.map((article) => <ArticleCard article={article} key={article.slug}/>)}</div></div></main>;
}
