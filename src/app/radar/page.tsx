import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { editorialRepository } from "@/services/editorial";
import styles from "./radar.module.css";

export const metadata = { title: "Radar Industrial | VTRES60", description: "Sinais editoriais da indústria brasileira, sempre com evidência real e verificável." };

export default async function RadarPage(){
  const[signals,posts]=await Promise.all([contentRepository.listPublishedRadarSignals(),editorialRepository.listPosts()]);
  const postById=new Map(posts.map(post=>[post.id,post]));
  return <main className="section"><div className="container">
    <header className={styles.head}><span className="eyebrow">Curadoria VTRES60</span><h1>Radar Industrial</h1><p>Sinais editoriais construídos exclusivamente a partir de posts reais publicados, com fonte e data verificáveis. Nenhum sinal é publicado sem evidência.</p></header>
    {signals.length===0?<div className={styles.empty}><p>Nenhum sinal publicado no momento.</p></div>:<div className={styles.grid}>{signals.map(signal=><article key={signal.id} className={styles.card}><time dateTime={signal.generatedAt}>{new Date(signal.generatedAt).toLocaleDateString("pt-BR")}</time><h2>{signal.title}</h2><p>{signal.summary}</p><div className={styles.evidence}><span>Evidências:</span><ul>{signal.evidencePostIds.map(id=>{const post=postById.get(id);return post?<li key={id}><Link href={`/noticias/${post.slug}`}>{post.title}</Link></li>:null})}</ul></div><div className={styles.sources}><span>Fontes:</span>{signal.sourceUrls.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a>)}</div></article>)}</div>}
  </div></main>
}
