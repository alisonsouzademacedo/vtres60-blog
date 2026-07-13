import type { MetadataRoute } from "next";
import { contentRepository } from "@/services/cms";
import { marketingPillars } from "@/data/seo-pillars";
import { configRepository } from "@/services/config";
import { editorialRepository } from "@/services/editorial";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, companies, segments,events,seo,categories,authors,tags] = await Promise.all([contentRepository.listArticles(), contentRepository.listCompanies(), contentRepository.listSegmentProfiles(),contentRepository.listEvents(),configRepository.getSeo(),editorialRepository.listCategories(),editorialRepository.listAuthors(),editorialRepository.listTags()]);
  const base=seo.canonicalBaseUrl; const now=new Date();
  return [
    {url:base,lastModified:now,changeFrequency:"daily",priority:1},
    {url:`${base}/noticias`,lastModified:now,changeFrequency:"hourly",priority:.9},
    {url:`${base}/segmentos`,lastModified:now,changeFrequency:"weekly",priority:.7},
    {url:`${base}/empresas`,lastModified:now,changeFrequency:"daily",priority:.8},
    {url:`${base}/agenda`,lastModified:now,changeFrequency:"weekly",priority:.6},
    ...["sobre","expediente","politica-editorial","privacidade"].map(path=>({url:`${base}/${path}`,lastModified:now,changeFrequency:"yearly" as const,priority:.3})),
    ...marketingPillars.map((pillar)=>({url:`${base}/marketing-industrial/${pillar.slug}`,lastModified:now,changeFrequency:"monthly" as const,priority:.85})),
    ...articles.map(a=>({url:`${base}/noticias/${a.slug}`,lastModified:new Date(a.updatedAt??a.publishedAt),changeFrequency:"weekly" as const,priority:.8})),
    ...categories.map(item=>({url:`${base}/categorias/${item.slug}`,lastModified:new Date(item.updatedAt),changeFrequency:"weekly" as const,priority:.7})),
    ...authors.map(item=>({url:`${base}/autores/${item.slug}`,lastModified:new Date(item.updatedAt),changeFrequency:"monthly" as const,priority:.5})),
    ...tags.map(item=>({url:`${base}/tags/${item.slug}`,lastModified:new Date(item.updatedAt),changeFrequency:"weekly" as const,priority:.5})),
    ...companies.map(c=>({url:`${base}/empresas/${c.slug}`,lastModified:now,changeFrequency:"daily" as const,priority:.7})),
    ...segments.map(s=>({url:`${base}/segmentos/${s.slug}`,lastModified:now,changeFrequency:"daily" as const,priority:.65})),
    ...events.map(event=>({url:`${base}/agenda/${event.slug}`,lastModified:now,changeFrequency:"weekly" as const,priority:.65})),
  ];
}
