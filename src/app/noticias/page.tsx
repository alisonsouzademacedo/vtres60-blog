import type { Metadata } from "next";
import { contentRepository } from "@/services/cms";
import { ArticleCard } from "@/components/editorial/article-card";
import styles from "./listing.module.css";

export const metadata: Metadata = { title: "Últimas notícias", description: "Notícias, análises, guias e cases selecionados para a indústria brasileira.", alternates: { canonical: "/noticias" } };

export default async function NewsPage() {
  const articles = await contentRepository.listArticles();
  return <main id="conteudo" className={styles.main}><header className={`container ${styles.head}`}><span className="eyebrow">Cobertura VTRES60</span><h1>Notícias da indústria</h1><p>Curadoria e contexto para transformar movimentos de mercado em decisões melhores.</p><nav aria-label="Filtrar por formato"><button className={styles.active}>Todos</button><button>Notícias</button><button>Análises</button><button>Guias</button><button>Cases</button></nav></header><section className={`container ${styles.grid}`}><h2 className="sr-only">Lista de notícias</h2>{articles.map(article=><ArticleCard article={article} key={article.slug}/>)}</section></main>;
}
