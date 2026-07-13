import Image from "next/image";
import Link from "next/link";
import type { SegmentProfile } from "@/types/content";
import type { HomeSettings } from "@/types/admin";
import { ArrowRight } from "@/components/ui/icons";
import styles from "./segment-showcase.module.css";

export function SegmentShowcase({segments,config}:{segments:SegmentProfile[];config?:HomeSettings["segments"]}){return <section className={`${styles.section} ${config?.theme==="light"?styles.light:""}`}><div className="container"><div className="section-head"><div><span className="eyebrow">{config?.eyebrow??"Navegue por setor"}</span><h2 className="section-title">{config?.title??"Segmentos industriais"}</h2>{config?.subtitle&&<p className={styles.subtitle}>{config.subtitle}</p>}</div></div><div className={styles.grid}>{segments.map((segment)=><Link href={`/segmentos/${segment.slug}`} key={segment.slug}><Image src={segment.image} alt={segment.imageAlt} fill sizes="(max-width:600px) 50vw, (max-width:1000px) 33vw, 20vw"/><div className={styles.overlay}/><div className={styles.content}><span>{segment.articleCount} notícias</span><strong>{segment.name}</strong><b>Explorar setor <ArrowRight size={13}/></b></div></Link>)}</div></div></section>}
