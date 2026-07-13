import type { Metadata } from "next";
import { contentRepository } from "@/services/cms";
import { AgendaShowcase } from "@/components/editorial/agenda-showcase";
import styles from "./agenda.module.css";

export const metadata:Metadata={title:"Agenda Industrial",description:"Feiras, congressos e eventos estratégicos para empresas e lideranças da indústria brasileira.",alternates:{canonical:"/agenda"}};
export default async function AgendaPage(){const events=await contentRepository.listEvents();return <main id="conteudo" className={styles.main}><header><div className="container"><span className="eyebrow">Feiras, eventos e congressos</span><h1>Agenda Industrial</h1><p>Os encontros que conectam tecnologia, negócios e lideranças da indústria brasileira.</p></div></header><AgendaShowcase events={events}/></main>}
