import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marketingPillars, getPillarBySlug } from "@/data/seo-pillars";
import { contentRepository } from "@/services/cms";
import { configRepository } from "@/services/config";
import { absoluteUrl, breadcrumbSchema } from "@/lib/seo";
import { ArticleCard } from "@/components/editorial/article-card";
import { WhatsAppCTA } from "@/components/editorial/whatsapp-cta";
import { ArrowRight } from "@/components/ui/icons";
import styles from "./pillar.module.css";

export function generateStaticParams(){return marketingPillars.map(({slug})=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const{slug}=await params;const pillar=getPillarBySlug(slug);if(!pillar)return{};const path=`/marketing-industrial/${pillar.slug}`;return{title:pillar.metaTitle,description:pillar.metaDescription,keywords:[pillar.keyword,"marketing indústria","marketing industrial","vendas B2B","SEO industrial"],alternates:{canonical:path},openGraph:{type:"article",title:pillar.metaTitle,description:pillar.metaDescription,url:path,siteName:"VTRES60 Indústria"},twitter:{card:"summary_large_image",title:pillar.metaTitle,description:pillar.metaDescription}}}

export default async function PillarPage({params}:{params:Promise<{slug:string}>}){
  const{slug}=await params;const pillar=getPillarBySlug(slug);if(!pillar)notFound();const[articles,settings]=await Promise.all([contentRepository.listArticles(),configRepository.getSettings()]);
  const related=articles.filter((article)=>article.tags.some((tag)=>["Marketing","SEO","CRM","Vendas B2B","IA"].includes(tag))||article.segments.some((segment)=>pillar.audience.toLowerCase().includes(segment.toLowerCase()))).slice(0,3);
  const pageUrl=`/marketing-industrial/${pillar.slug}`;
  const graph={"@context":"https://schema.org","@graph":[
    {"@type":"Article","@id":`${absoluteUrl(pageUrl)}#article`,headline:pillar.title,description:pillar.metaDescription,mainEntityOfPage:absoluteUrl(pageUrl),datePublished:"2026-06-27",dateModified:"2026-06-27",author:{"@type":"Organization",name:"VTRES60"},publisher:{"@type":"Organization",name:"VTRES60"},keywords:[pillar.keyword,"marketing indústria","marketing industrial"]},
    breadcrumbSchema([{name:"Início",url:"/"},{name:"Marketing Industrial",url:"/categorias/marketing-industrial"},{name:pillar.title,url:pageUrl}]),
    {"@type":"FAQPage",mainEntity:pillar.faq.map((item)=>({"@type":"Question",name:item.question,acceptedAnswer:{"@type":"Answer",text:item.answer}}))}
  ]};
  return <main id="conteudo" className={styles.main}>
    <header className={styles.hero}><div className="container"><nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Início</Link><span>/</span><Link href="/categorias/marketing-industrial">Marketing Industrial</Link><span>/</span><b>{pillar.title}</b></nav><span className="eyebrow">Guia estratégico VTRES60</span><h1>{pillar.title}</h1><p>{pillar.introduction}</p><div className={styles.heroActions}><a href="#conteudo-guia">Explorar o guia <ArrowRight size={15}/></a><a href="#especialista">Falar com especialista</a></div></div></header>
    <div className={`container ${styles.layout}`} id="conteudo-guia"><aside className={styles.index}><span>NESTE GUIA</span>{pillar.sections.map((section,index)=><a href={`#${section.id}`} key={section.id}><b>0{index+1}</b>{section.title}</a>)}<a href="#perguntas"><b>04</b>Perguntas frequentes</a></aside><article className={styles.article}><div className={styles.intro}><strong>Por que este tema importa</strong><p>Empresas que estruturam {pillar.keyword} com visão de negócio ganham clareza de posicionamento, consistência comercial e uma base mais sólida para crescimento orgânico.</p></div>{pillar.sections.map((section,index)=><section id={section.id} key={section.id}><small>CAPÍTULO 0{index+1}</small><h2>{section.title}</h2>{section.paragraphs.map((paragraph)=><p key={paragraph}>{paragraph}</p>)}</section>)}<section className={styles.faq} id="perguntas"><small>FAQ</small><h2>Perguntas frequentes sobre {pillar.keyword}</h2>{pillar.faq.map((item)=><details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section></article></div>
    <section className={styles.relatedPillars}><div className="container"><div className="section-head"><div><span className="eyebrow">Continue a jornada</span><h2 className="section-title">Outros guias de Marketing Industrial</h2></div></div><div className={styles.pillarGrid}>{marketingPillars.filter((item)=>item.slug!==pillar.slug).slice(0,3).map((item)=><Link href={`/marketing-industrial/${item.slug}`} key={item.slug}><span>GUIA</span><h3>{item.title}</h3><p>{item.metaDescription}</p><b>Explorar conteúdo <ArrowRight size={13}/></b></Link>)}</div></div></section>
    {related.length>0&&<section className={styles.relatedNews}><div className="container"><div className="section-head"><div><span className="eyebrow">Aplicação e contexto</span><h2 className="section-title">Artigos relacionados</h2></div><Link className="section-link" href="/noticias">Todas as notícias →</Link></div><div className={styles.newsGrid}>{related.map((article)=><ArticleCard article={article} key={article.slug}/>)}</div></div></section>}
    <section className={styles.cta} id="especialista"><div className="container"><div><span>ESTRATÉGIA VTRES60</span><h2>Transforme conhecimento em demanda para sua indústria.</h2></div><WhatsAppCTA whatsapp={settings.whatsapp} label="Falar com um especialista" placement="marketing_industrial_pillar">Falar com um especialista <ArrowRight size={15}/></WhatsAppCTA></div></section>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(graph)}}/>
  </main>;
}
