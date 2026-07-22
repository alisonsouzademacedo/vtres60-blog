import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { editorialRepository } from "@/services/editorial";
import styles from "./radar.module.css";

export const metadata = { title: "Radar Industrial | VTRES60", description: "Sinais editoriais da indústria brasileira, sempre com evidência real e verificável." };

// Mesma guarda usada em src/app/page.tsx: sourceUrls são sempre derivadas
// server-side de posts reais, mas um dado histórico malformado não pode
// derrubar a página inteira.
const safeHostname=(url:string)=>{try{return new URL(url).hostname}catch{return url}};

export default async function RadarPage(){
  const[signals,posts]=await Promise.all([contentRepository.listPublishedRadarSignals(),editorialRepository.listPosts()]);
  const postById=new Map(posts.map(post=>[post.id,post]));
  return <main id="conteudo" className="section"><div className="container">
    <header className={styles.head}><span className="eyebrow">Curadoria VTRES60</span><h1>Radar Industrial</h1><p>Sinais editoriais construídos exclusivamente a partir de posts reais publicados, com fonte e data verificáveis. Nenhum sinal é publicado sem evidência.</p></header>
    {signals.length===0?<div className={styles.empty}><p>Nenhum sinal publicado no momento.</p></div>:<div className={styles.grid}>{signals.map(signal=><article key={signal.id} className={styles.card}><time dateTime={signal.generatedAt}>{new Date(signal.generatedAt).toLocaleDateString("pt-BR")}</time><h2>{signal.title}</h2><p>{signal.summary}</p><div className={styles.evidence}><span>Evidências:</span><ul>{signal.evidencePostIds.map(id=>{const post=postById.get(id);return post?<li key={id}><Link href={`/noticias/${post.slug}`}>{post.title}</Link></li>:null})}</ul></div><div className={styles.sources}><span>Fontes:</span>{signal.sourceUrls.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{safeHostname(url)}</a>)}</div></article>)}</div>}
  </div></main>
}
