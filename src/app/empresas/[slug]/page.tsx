import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentRepository } from "@/services/cms";
import { ArticleCard } from "@/components/editorial/article-card";
import { Building2, TrendingUp } from "@/components/ui/icons";
import styles from "./company.module.css";

export async function generateStaticParams() {
  const companies = await contentRepository.listCompanies();
  return companies.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = await contentRepository.getCompanyBySlug(slug);
  return company ? { title: `${company.name}: notícias e inteligência`, description: `Acompanhe notícias, estratégia e movimentos da ${company.name}.`, alternates: { canonical: `/empresas/${slug}` } } : {};
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [company, articles] = await Promise.all([contentRepository.getCompanyBySlug(slug), contentRepository.listArticles()]);
  if (!company) notFound();
  let companyArticles = articles.filter((article) => article.companies.includes(company.name));
  if (companyArticles.length < 3) companyArticles = [...companyArticles, ...articles.filter((article) => !companyArticles.includes(article)).slice(0, 3 - companyArticles.length)];
  return <main id="conteudo" className={styles.main}>
    <header className={styles.hero} style={{ "--accent": company.accent } as React.CSSProperties}><div className="container"><nav><Link href="/">Início</Link> / <Link href="/empresas">Empresas</Link> / {company.name}</nav><div className={styles.identity}><div className={styles.icon}><Building2 size={28}/></div><div><span>HUB EDITORIAL</span><h1>{company.name}</h1><p>{company.description}</p></div>{company.ticker && <aside><span>B3</span><strong>{company.ticker}</strong><small><TrendingUp size={12}/> acompanhamento</small></aside>}</div><div className={styles.metrics}><div><span>SETOR</span><b>{company.sector}</b></div><div><span>NOTÍCIAS MONITORADAS</span><b>{companyArticles.length}</b></div><div><span>PRINCIPAIS TEMAS</span><b>Tecnologia · Mercado · Estratégia</b></div></div></div></header>
    <section className="section"><div className="container"><div className="section-head"><div><span className="eyebrow">Linha do tempo</span><h2 className="section-title">Últimos movimentos</h2></div></div><div className={styles.grid}>{companyArticles.map((article) => <ArticleCard article={article} key={article.slug}/>)}</div></div></section>
    <section className={styles.analysis}><div className="container"><span className="eyebrow">Leitura estratégica</span><h2>Por que acompanhar {company.name}?</h2><p>Movimentos de empresas líderes antecipam mudanças em investimento, demanda, tecnologia e cadeias de fornecimento. Este hub reúne os sinais relevantes e explica o que eles representam para outras indústrias.</p></div></section>
  </main>;
}
