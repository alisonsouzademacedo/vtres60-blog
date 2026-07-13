import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { configRepository } from "@/services/config";
import { Hero } from "@/components/editorial/hero";
import { FeaturedNews } from "@/components/editorial/featured-news";
import { ArticleCard } from "@/components/editorial/article-card";
import { SegmentShowcase } from "@/components/editorial/segment-showcase";
import { AgendaShowcase } from "@/components/editorial/agenda-showcase";
import { SegmentSelector } from "@/components/editorial/segment-selector";
import { MarketWeather } from "@/components/widgets/market-weather";
import { NewsletterForm } from "@/components/editorial/newsletter-form";
import { ArrowRight, Building2, Sparkles, TrendingUp, Zap } from "@/components/ui/icons";
import { slugify } from "@/lib/content";
import styles from "./home.module.css";

export default async function Home(){
  const[articles,companies,events,segmentProfiles,home]=await Promise.all([contentRepository.listArticles(),contentRepository.listCompanies(),contentRepository.listEvents(),contentRepository.listSegmentProfiles(),configRepository.getHome()]);
  const filtered=home.latest.categoryFilter?articles.filter((article)=>article.categorySlug===home.latest.categoryFilter):articles;
  const latest=[...filtered].sort((a,b)=>home.latest.order==="popular"?(b.mostRead??0)-(a.mostRead??0):home.latest.order==="oldest"?new Date(a.publishedAt).getTime()-new Date(b.publishedAt).getTime():new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime());
  const ranked=[...articles].sort((a,b)=>new Date(b.publishedAt).getTime()-new Date(a.publishedAt).getTime()).slice(0,5);
  const orderedSegments=segmentProfiles.filter(item=>item.showOnHome!==false).sort((a,b)=>{const ai=home.segments.order.indexOf(a.slug),bi=home.segments.order.indexOf(b.slug);return(ai<0?(a.order??999):ai)-(bi<0?(b.order??999):bi)});
  return <main id="conteudo"><Hero config={home.hero}/><FeaturedNews articles={articles} config={home.featured}/>

    {home.latest.enabled&&<section className={`section ${styles.lightSection} ${styles.latestSection}`} data-layout={home.latest.layout}><div className="container"><div className="section-head"><div><span className="eyebrow">{home.latest.eyebrow}</span><h2 className="section-title">{home.latest.title}</h2>{home.latest.subtitle&&<p>{home.latest.subtitle}</p>}</div><Link className="section-link" href="/noticias">Ver feed completo →</Link></div><div className={styles.feedLayout}><div className={styles.feed}>{latest.slice(0,home.latest.postCount).map((article)=><ArticleCard key={article.slug} article={article} compact showExcerpt/>)}</div><aside className={styles.ranking}><header><TrendingUp size={16}/><b>Selecao editorial</b><span>Curadoria VTRES60</span></header>{ranked.map((article,index)=><Link href={`/noticias/${article.slug}`} key={article.slug}><strong>{index+1}</strong><div><span>{article.category}</span><b>{article.title}</b></div></Link>)}</aside></div></div></section>}

    {home.segments.enabled&&<SegmentShowcase segments={orderedSegments} config={home.segments}/>} {home.agenda.enabled&&<AgendaShowcase events={events.filter(item=>item.showOnHome!==false).slice(0,home.agenda.eventCount)} config={home.agenda}/>} 

    {home.modules.radar&&<section className={`section-tight ${styles.radar}`}><div className="container"><div className="section-head"><div><span className="eyebrow"><Zap size={12}/> Atualização contínua</span><h2 className="section-title">Radar Industrial</h2></div><Link className="section-link" href="/noticias">Abrir radar →</Link></div><div className={styles.radarGrid}><div className={styles.radarLead}><div className={styles.pulse}><span/><b>SINAL EDITORIAL</b></div><h3>IA industrial acelera projetos de eficiência — mas integração ainda é o gargalo</h3><p>O interesse cresce em manutenção, qualidade e engenharia. A vantagem aparece quando a tecnologia conversa com dados reais da operação.</p><div className={styles.radarTags}>{["Inteligência Artificial","Automação","Dados industriais"].map((tag)=><Link key={tag} href={`/tags/${slugify(tag)}`}>#{tag}</Link>)}</div></div><div className={styles.radarList}>{companies.slice(0,4).map((company,index)=><Link href={`/empresas/${company.slug}`} key={company.slug}><span>{String(index+1).padStart(2,"0")}</span><div><b>{company.name}</b><small>{company.sector} · {index%2===0?"em acompanhamento":"contexto setorial"}</small></div><TrendingUp size={15}/></Link>)}</div></div></div></section>}

    {home.modules.segmentFilter&&<SegmentSelector/>}

    {home.modules.intelligence&&<section className={`section ${styles.intelligence}`}><div className="container"><div className={styles.intelHead}><div><span className="eyebrow"><Sparkles size={12}/> Inteligência VTRES60</span><h2>Oportunidades por trás<br/>das notícias</h2><p>Sinais de mercado transformados em ações para marketing, vendas e crescimento industrial.</p></div><div className={styles.intelNumber}><span>CURADORIA</span><strong>B2B</strong><small>INDUSTRIA</small></div></div><div className={styles.intelGrid}>{[["01","Demanda emergente","Fabricantes de máquinas encontram espaço em retrofit e eficiência energética.","Mapear base instalada"],["02","Sinal comercial","Ciclos de venda maiores exigem conteúdo técnico para múltiplos decisores.","Revisar jornada B2B"],["03","Movimento digital","Buscas por automação crescem em polos industriais fora das capitais.","Priorizar SEO regional"]].map(([n,title,text,action])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p><b>{action}<ArrowRight size={13}/></b></article>)}</div></div></section>}

    {home.modules.analysis&&<section className={`section ${styles.analysisSection}`}><div className="container"><div className={styles.analysisLayout}><header><span className="eyebrow">Análise VTRES60</span><small>ESTRATÉGIA · COMPETITIVIDADE · CRESCIMENTO</small><h2>Automação deixou de ser eficiência operacional. Agora, é estratégia comercial.</h2><p>A convergência entre dados de produção, CRM e inteligência artificial muda a forma como a indústria precifica, atende e cresce. Empresas que tratam essa integração como projeto de negócio começam a construir uma vantagem difícil de copiar.</p><a href="mailto:especialista@vtres60.com.br">Falar com um especialista <ArrowRight size={15}/></a></header><aside><span>PRINCIPAIS IMPACTOS</span><ol><li><b>Margens mais protegidas</b><p>Menos variabilidade e melhor leitura de custos reais.</p></li><li><b>Vendas mais previsíveis</b><p>Capacidade produtiva conectada à demanda comercial.</p></li><li><b>Decisões mais rápidas</b><p>Dados operacionais transformados em sinais de mercado.</p></li></ol></aside></div></div></section>}

    {home.modules.companies&&<section className={`section ${styles.companies}`}><div className="container"><div className="section-head"><div><span className="eyebrow">Empresas acompanhadas</span><h2 className="section-title">Hubs editoriais</h2></div><Link className="section-link" href="/empresas">Todas as empresas →</Link></div><p className={styles.intro}>Notícias, movimentos estratégicos, indicadores e contexto reunidos em uma linha do tempo para cada companhia.</p><div className={styles.companyGrid}>{companies.map((company)=><Link href={`/empresas/${company.slug}`} key={company.slug} style={{"--accent":company.accent} as React.CSSProperties}><header><Building2 size={18}/>{company.ticker&&<small>{company.ticker}</small>}</header><strong>{company.name}</strong><span>{company.sector}</span><p>{company.description}</p><footer>Explorar hub <ArrowRight size={13}/></footer></Link>)}</div></div></section>}

    {home.modules.market&&<MarketWeather/>}
    {home.newsletter.enabled&&<section className={styles.newsletter} id="newsletter"><div className="container"><div className={styles.newsInner}><div className={styles.newsValue}><span className="eyebrow">{home.newsletter.eyebrow}</span><h2>{home.newsletter.title}</h2><p>{home.newsletter.description}</p><ul>{home.newsletter.benefits.map((benefit)=><li key={benefit}>{benefit}</li>)}</ul></div><NewsletterForm config={home.newsletter}/></div></div></section>}
  </main>
}
