import Image from "next/image";
import Link from "next/link";
import type { IndustrialEvent } from "@/types/content";
import type { HomeSettings } from "@/types/admin";
import { ArrowRight, CalendarDays } from "@/components/ui/icons";
import styles from "./agenda-showcase.module.css";

export function AgendaShowcase({events,config}:{events:IndustrialEvent[];config?:HomeSettings["agenda"]}){return <section className={styles.section}><div className="container"><div className="section-head"><div><span className="eyebrow">{config?.eyebrow??"Próximos encontros"}</span><h2 className="section-title">{config?.title??"Agenda Industrial"}</h2>{config?.subtitle&&<p className={styles.subtitle}>{config.subtitle}</p>}</div><Link className="section-link" href={config?.cta.url??"/agenda"}>{config?.cta.label??"Agenda completa"} →</Link></div><div className={styles.grid}>{events.map((event)=><Link href={`/agenda/${event.slug}`} key={event.slug}><div className={styles.image}><Image src={event.image} alt={event.imageAlt} fill sizes="(max-width:800px) 100vw, 33vw"/><span>{event.date} <b>{event.month}</b></span></div><div className={styles.body}><small>{event.segment}</small><h3>{event.title}</h3><p><CalendarDays size={13}/>{event.location}</p><footer>Ver detalhes <ArrowRight size={13}/></footer></div></Link>)}</div></div></section>}
