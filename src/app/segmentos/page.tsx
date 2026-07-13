import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { Factory } from "@/components/ui/icons";
import { slugify } from "@/lib/content";
import styles from "./segments.module.css";
export default async function Page(){const segments=await contentRepository.listSegments();return <main id="conteudo" className={styles.main}><div className="container"><span className="eyebrow">Mapa da indústria</span><h1>Segmentos industriais</h1><p>Encontre a cobertura mais relevante para o seu mercado.</p><div className={styles.grid}>{segments.map(segment=><Link href={`/segmentos/${slugify(segment)}`} key={segment}><Factory/><strong>{segment}</strong><span>Notícias, dados e tendências →</span></Link>)}</div></div></main>}
