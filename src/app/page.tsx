import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { configRepository } from "@/services/config";
import { Hero } from "@/components/editorial/hero";
import { FeaturedNews } from "@/components/editorial/featured-news";
import { ArticleCard } from "@/components/editorial/article-card";
import { SegmentShowcase } from "@/components/editorial/segment-showcase";
import { AgendaShowcase } from "@/components/editorial/agenda-showcase";
import { SegmentSelector } from "@/components/editorial/segment-selector";
import { WhatsAppCTA } from "@/components/editorial/whatsapp-cta";
import { MarketWeather } from "@/components/widgets/market-weather";
import { NewsletterForm } from "@/components/editorial/newsletter-form";
import { ArrowRight, Building2, Sparkles, TrendingUp, Zap } from "@/components/ui/icons";
import styles from "./home.module.css";

// Fase 8D — sourceUrls do Radar são sempre derivadas server-side de posts
// reais (nunca digitadas livremente), mas um dado histórico malformado não
// pode derrubar a home inteira: new URL() sem guarda lançaria e quebraria
// o render do Server Component.
const safeHostname=(url:string)=>{try{return new URL(url).hostname}catch{return url}};

export default async function Home(){
  const[articles,companies,events,segmentProfiles,home,settings,radarSignals,intelligenceItems]=await Promise.all([contentRepository.listArticles(),contentRepository.listCompanies(),contentRepository.listEvents(),contentRepository.listSegmentProfiles(),configRepository.getHome(),configRepository.getSettings(),contentRepository.listPublishedRadarSignals(),contentRepository.listPublishedIntelligenceItems()]);
  const filtered=home.latest.categoryFilter?articles.filter((article)=>article.categorySlug===home.latest.categoryFilter):articles;
  const latest=[...filtered].sort((a,b)=>home.latest.order==="popular"?(b.mostRead??0)-(a.mostRead??0):home.latest.order==="oldest"?new Date(a.publishedAt).getTime()-new Date(b.publishedAt).getTime():new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime());
  const ranked=[...articles].sort((a,b)=>new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime()).slice(0,5);
  const orderedSegments=segmentProfiles.filter(item=>item.showOnHome!==false).sort((a,b)=>{const ai=home.segments.order.indexOf(a.slug),bi=home.segments.order.indexOf(b.slug);return(ai<0?(a.order??999):ai)-(bi<0?(b.order??999):bi)});
  return <main id="conteudo"><Hero config={home.hero}/><FeaturedNews articles={articles} config={home.featured}/>

    {home.latest.enabled&&<section className={`section ${styles.lightSection} ${styles.latestSection}`} data-layout={home.latest.layout}><div className="container"><div className="section-head"><div><span className="eyebrow">{home.latest.eyebrow}</span><h2 className="section-title">{home.latest.title}</h2>{home.latest.subtitle&&<p>{home.latest.subtitle}</p>}</div><Link className="section-link" href="/noticias">Ver feed completo →</Link></div><div className={styles.feedLayout}><div className={styles.feed}>{latest.slice(0,home.latest.postCount).map((article)=><ArticleCard key={article.slug} article={article} compact showExcerpt/>)}</div><aside className={styles.ranking}><header><TrendingUp size={16}/><b>Selecao editorial</b><span>Curadoria VTRES60</span></header>{ranked.map((article,index)=><Link href={`/noticias/${article.slug}`} key={article.slug}><strong>{index+1}</strong><div><span>{article.category}</span><b>{article.title}</b></div></Link>)}</aside></div></div></section>}

    {home.segments.enabled&&<SegmentShowcase segments={orderedSegments} config={home.segments}/>} {home.agenda.enabled&&<AgendaShowcase events={events.filter(item=>item.showOnHome!==false).slice(0,home.agenda.eventCount)} config={home.agenda}/>} 

    {home.modules.radar&&<section className={`section-tight ${styles.radar}`}><div className="container"><div className="section-head"><div><span className="eyebrow"><Zap size={12}/> Atualização contínua</span><h2 className="section-title">Radar Industrial</h2></div><Link className="section-link" href="/radar">Abrir radar →</Link></div>{radarSignals.length===0?<div className={styles.emptyState}><p>Nenhum sinal publicado no momento. O Radar Industrial só mostra sinais com evidência real, revisados e aprovados pela curadoria VTRES60.</p></div>:<div className={styles.radarGrid}><div className={styles.radarLead}><div className={styles.pulse}><span/><b>SINAL EDITORIAL</b></div><h3>{radarSignals[0].title}</h3><p>{radarSignals[0].summary}</p><div className={styles.radarTags}>{radarSignals[0].tagIds.map((tagId)=><Link key={tagId} href={`/tags/${tagId}`}>#{tagId}</Link>)}</div><div className={styles.evidenceList}><span>Evidências:</span>{radarSignals[0].sourceUrls.map((url)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{safeHostname(url)}</a>)}</div></div><div className={styles.radarList}>{radarSignals.slice(1,5).map((signal,index)=><Link href="/radar" key={signal.id}><span>{String(index+2).padStart(2,"0")}</span><div><b>{signal.title}</b><small>{signal.confidence==="alta"?"Confiança alta":signal.confidence==="média"?"Confiança média":"Confiança baixa"}</small></div><TrendingUp size={15}/></Link>)}</div></div>}</div></section>}

    {home.modules.segmentFilter&&<SegmentSelector segments={segmentProfiles.map(item=>item.name)}/>}

    {home.modules.intelligence&&<section className={`section ${styles.intelligence}`}><div className="container"><div className={styles.intelHead}><div><span className="eyebrow"><Sparkles size={12}/> Inteligência VTRES60</span><h2>Oportunidades por trás<br/>das notícias</h2><p>Sinais de mercado transformados em ações para marketing, vendas e crescimento industrial.</p></div><div className={styles.intelNumber}><span>CURADORIA</span><strong>B2B</strong><small>INDUSTRIA</small></div></div>{intelligenceItems.length===0?<div className={styles.emptyState}><p>Nenhuma análise publicada no momento. Cada item de Inteligência VTRES60 nasce de um sinal real do Radar, revisado antes de ir ao ar.</p></div>:<div className={styles.intelGrid}>{intelligenceItems.slice(0,3).map((item)=><article key={item.id}><span className={styles.kindBadge} data-kind={item.kind}>{item.kind==="fact"?"FATO":item.kind==="analysis"?"ANÁLISE VTRES60":"RECOMENDAÇÃO"}</span><h3>{item.title}</h3><p>{item.analysis}</p>{item.kind==="recommendation"&&item.recommendedAction&&<b>{item.recommendedAction}<ArrowRight size={13}/></b>}</article>)}</div>}</div></section>}

    {home.modules.analysis&&<section className={`section ${styles.analysisSection}`}><div className="container"><div className={styles.analysisLayout}><header><span className="eyebrow">Análise VTRES60</span><small>ESTRATÉGIA · COMPETITIVIDADE · CRESCIMENTO</small><h2>Automação deixou de ser eficiência operacional. Agora, é estratégia comercial.</h2><p>A convergência entre dados de produção, CRM e inteligência artificial muda a forma como a indústria precifica, atende e cresce. Empresas que tratam essa integração como projeto de negócio começam a construir uma vantagem difícil de copiar.</p><WhatsAppCTA whatsapp={settings.whatsapp} label="Falar com um especialista" placement="home_analysis">Falar com um especialista <ArrowRight size={15}/></WhatsAppCTA></header><aside><span>PRINCIPAIS IMPACTOS</span><ol><li><b>Margens mais protegidas</b><p>Menos variabilidade e melhor leitura de custos reais.</p></li><li><b>Vendas mais previsíveis</b><p>Capacidade produtiva conectada à demanda comercial.</p></li><li><b>Decisões mais rápidas</b><p>Dados operacionais transformados em sinais de mercado.</p></li></ol></aside></div></div></section>}

    {home.modules.companies&&<section className={`section ${styles.companies}`}><div className="container"><div className="section-head"><div><span className="eyebrow">Empresas acompanhadas</span><h2 className="section-title">Hubs editoriais</h2></div><Link className="section-link" href="/empresas">Todas as empresas →</Link></div><p className={styles.intro}>Notícias, movimentos estratégicos, indicadores e contexto reunidos em uma linha do tempo para cada companhia.</p>{companies.filter(c=>c.hasCoverage).length===0?<div className={styles.emptyState}><p>Nenhuma empresa com cobertura editorial publicada ainda.</p></div>:<div className={styles.companyGrid}>{companies.filter(c=>c.hasCoverage).sort((a,b)=>Number(b.featured)-Number(a.featured)).map((company)=><Link href={`/empresas/${company.slug}`} key={company.slug} style={{"--accent":company.accent} as React.CSSProperties}><header><Building2 size={18}/>{company.ticker&&<small>{company.ticker}</small>}</header><strong>{company.name}</strong><span>{company.sector}</span><p>{company.description}</p><footer>Explorar hub <ArrowRight size={13}/></footer></Link>)}</div>}</div></section>}

    {home.modules.market&&<MarketWeather/>}
    {home.newsletter.enabled&&<section className={styles.newsletter} id="newsletter"><div className="container"><div className={styles.newsInner}><div className={styles.newsValue}><span className="eyebrow">{home.newsletter.eyebrow}</span><h2>{home.newsletter.title}</h2><p>{home.newsletter.description}</p><ul>{home.newsletter.benefits.map((benefit)=><li key={benefit}>{benefit}</li>)}</ul></div><NewsletterForm config={home.newsletter}/></div></div></section>}
  </main>
}
