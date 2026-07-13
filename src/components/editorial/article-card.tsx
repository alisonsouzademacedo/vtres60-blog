import Image from "next/image";
import Link from "next/link";
import type { Article } from "@/types/content";
import { ArrowRight, Clock3 } from "@/components/ui/icons";
import { getRelativeTime } from "@/lib/content";
import styles from "./article-card.module.css";

export function ArticleCard({ article, compact = false, showExcerpt = false, priority = false }: { article: Article; compact?: boolean; showExcerpt?: boolean; priority?: boolean }) {
  return <article className={`${styles.card} ${compact ? styles.compact : ""} ${showExcerpt ? styles.withExcerpt : ""}`} data-segments={article.segments.join("|")}>
    <Link className={styles.image} href={`/noticias/${article.slug}`}><Image src={article.image} alt={article.imageAlt} fill priority={priority} sizes={compact ? "(max-width: 800px) 100vw, 280px" : "(max-width: 800px) 100vw, 420px"} /></Link>
    <div className={styles.body}><div className={styles.meta}><span>{article.category}</span><time dateTime={article.publishedAt}>{getRelativeTime(article.publishedAt)}</time></div>
      <h3><Link href={`/noticias/${article.slug}`}>{article.title}</Link></h3>
      {(!compact || showExcerpt) && <p>{article.excerpt}</p>}
      <div className={styles.foot}><span className={styles.type}>{article.type}</span><span><Clock3 size={12}/>{article.readingTime} min</span><Link className={styles.readMore} href={`/noticias/${article.slug}`}>Ler mais <ArrowRight size={11}/></Link></div>
    </div>
  </article>;
}
