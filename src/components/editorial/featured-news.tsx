import Image from "next/image";
import Link from "next/link";
import type { Article } from "@/types/content";
import type { HomeSettings } from "@/types/admin";
import { ArrowRight, Clock3 } from "@/components/ui/icons";
import { getRelativeTime } from "@/lib/content";
import { resolveLeadArticle } from "@/lib/article-ordering";
import { ArticleCard } from "./article-card";
import styles from "./featured-news.module.css";

export function FeaturedNews({articles,config}:{articles:Article[];config:HomeSettings["featured"]}) {
  if(!config.enabled||!articles.length)return null;
  const lead=resolveLeadArticle(articles,config.leadArticleSlug);if(!lead)return null;
  const configuredSides=config.sideArticleSlugs.map((slug)=>articles.find((article)=>article.slug===slug)).filter((article):article is Article=>Boolean(article)&&article?.slug!==lead.slug);
  const fallback=articles.filter((article)=>article.slug!==lead.slug&&!configuredSides.some((item)=>item.slug===article.slug));const secondary=[...configuredSides,...fallback].slice(0,3);
  return <section className="section featured-section"><div className="container">
    <div className="section-head"><div><span className="eyebrow">{config.eyebrow}</span><h2 className="section-title">{config.title}</h2>{config.subtitle&&<p>{config.subtitle}</p>}</div><Link className="section-link" href={config.button.url}>{config.button.label} →</Link></div>
    <div className={styles.layout}>
      <article className={styles.lead} data-segments={lead.segments.join("|")}><Link className={styles.image} href={`/noticias/${lead.slug}`}><Image src={lead.image} alt={lead.imageAlt} fill priority fetchPriority="high" sizes="(max-width:800px) 100vw, 820px"/><div className={styles.gradient}/><div className={styles.content}><div className={styles.meta}><span>{lead.category}</span><time>{getRelativeTime(lead.publishedAt)}</time><small><Clock3 size={12}/>{lead.readingTime} min</small></div><h3>{lead.title}</h3><p>{lead.excerpt}</p>{lead.impact&&<div className={styles.impact}>{lead.impact}</div>}<b>Entenda a análise <ArrowRight size={15}/></b></div></Link></article>
      <div className={styles.side}>{secondary.slice(0,3).map(article=><ArticleCard key={article.slug} article={article} compact />)}</div>
    </div>
  </div></section>;
}
