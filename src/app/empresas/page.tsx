import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { Building2 } from "@/components/ui/icons";
import styles from "./companies.module.css";
export default async function Page(){const companies=await contentRepository.listCompanies();return <main id="conteudo" className={styles.main}><div className="container"><span className="eyebrow">Monitoramento editorial</span><h1>Empresas acompanhadas</h1><p>Hubs com notícias, estratégia, indicadores e uma linha do tempo dos movimentos que importam.</p><div className={styles.grid}>{companies.map(c=><Link href={`/empresas/${c.slug}`} key={c.slug} style={{"--accent":c.accent} as React.CSSProperties}><Building2/><span>{c.sector}</span><strong>{c.name}</strong><p>{c.description}</p><b>Explorar hub →</b></Link>)}</div></div></main>}
