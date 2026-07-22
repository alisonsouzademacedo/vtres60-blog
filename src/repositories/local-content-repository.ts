import { compareByRecency } from "@/lib/article-ordering";
import { isVisibleToPublic } from "@/lib/agenda/event-lifecycle";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";
import type { ContentRepository } from "@/services/cms/content-repository";
import type { Article } from "@/types/content";
import type { EducationalArticle, ManagedAuthor, ManagedCategory, ManagedPost, ManagedTag } from "@/types/editorial";

export const visible=(status:string,scheduledAt:string)=>status==="published"||(status==="scheduled"&&Boolean(scheduledAt)&&new Date(scheduledAt)<=new Date());
// Fase 8B — contagem real de posts por segmento, calculada em tempo de
// leitura a partir de posts.segment_slugs (nunca mais um NumberField
// digitado manualmente no admin). Mesma regra de visibilidade publica ja
// usada por allArticles(): draft nunca conta; scheduled so conta quando a
// data ja chegou.
export async function countPostsBySegment():Promise<Record<string,number>>{
  const posts=await editorialRepository.listPosts();
  const counts:Record<string,number>={};
  for(const post of posts){
    if(!visible(post.status,post.scheduledAt))continue;
    for(const slug of post.segmentSlugs)counts[slug]=(counts[slug]??0)+1;
  }
  return counts;
}
const ACCENTS=["#3185ff","#7c65ff","#36c4a1","#ef9b4e","#6abf69","#64a8ff"];
function accentFor(slug:string):string{
  let hash=0;
  for(const char of slug)hash=(hash*31+char.charCodeAt(0))>>>0;
  return ACCENTS[hash%ACCENTS.length];
}
// Fase 8D — mesma regra de src/lib/agent/taxonomies.ts: associação
// post<->empresa é por NOME EXATO (post.companies.includes(company.name)),
// nunca por id/slug. hasCoverage só é true quando existe pelo menos um
// post PUBLICAMENTE VISÍVEL com esse nome exato — nunca por
// "monitoramento", que não existe nesta fase (ver Task 15).
export async function countPostsByCompanyName():Promise<Record<string,number>>{
  const posts=await editorialRepository.listPosts();
  const counts:Record<string,number>={};
  for(const post of posts){
    if(!visible(post.status,post.scheduledAt))continue;
    for(const name of post.companies)counts[name]=(counts[name]??0)+1;
  }
  return counts;
}
function resolveAuthor(id:string,authors:ManagedAuthor[]){const author=authors.find(item=>item.id===id);return author?{name:author.name,slug:author.slug,role:author.role}:{name:"Redação VTRES60",slug:"redacao-vtres60",role:"Inteligência Industrial"}}
function resolveCategory(id:string,categories:ManagedCategory[]){return categories.find(item=>item.id===id)??{name:"Indústria",slug:"industria"}}
function resolveTags(ids:string[],tags:ManagedTag[]){return ids.map(id=>tags.find(item=>item.id===id)?.name).filter((name):name is string=>Boolean(name))}
function postToArticle(post:ManagedPost,categories:ManagedCategory[],authors:ManagedAuthor[],tags:ManagedTag[]):Article{const category=resolveCategory(post.categoryId,categories);return{id:post.id,slug:post.slug,type:post.contentType,title:post.title,excerpt:post.excerpt,impact:post.impact,category:category.name,categorySlug:category.slug,segments:post.segmentSlugs.map(slug=>slug.split("-").map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ")),companies:post.companies,tags:resolveTags(post.tagIds,tags),image:post.featuredImage,imageAlt:post.imageAlt||post.title,author:resolveAuthor(post.authorId,authors),publishedAt:post.status==="scheduled"?post.scheduledAt:post.publishedAt,updatedAt:post.updatedAt,readingTime:post.readingTime,featured:post.featured||post.mainStory,mostRead:Math.max(0,10000-post.displayOrder*350),body:post.content.split(/\n\n+/).filter(Boolean),content:post.content,imageCaption:post.imageCaption,imageCredit:post.imageCredit,sourceName:post.sourceName,sourceUrl:post.sourceUrl,seo:post.seo,faq:post.faq,cta:post.cta}}
function educationalToArticle(item:EducationalArticle,categories:ManagedCategory[],authors:ManagedAuthor[],tags:ManagedTag[]):Article{const category=resolveCategory(item.categoryId,categories);return{id:item.id,slug:item.slug,type:"guia",title:item.title,excerpt:item.excerpt,impact:`Aprofunde ${item.primaryKeyword} e transforme conhecimento em decisões aplicáveis ao contexto industrial.`,category:category.name,categorySlug:category.slug,segments:[],companies:[],tags:resolveTags(item.tagIds,tags),image:item.featuredImage,imageAlt:item.imageAlt||item.title,author:resolveAuthor(item.authorId,authors),publishedAt:item.status==="scheduled"?item.scheduledAt:item.publishedAt,updatedAt:item.updatedAt,readingTime:item.readingTime,featured:false,mostRead:0,body:item.content.split(/\n\n+/).filter(Boolean),content:item.content,educational:true,seo:item.seo,faq:item.faq,cta:item.cta}}
async function allArticles(){const[posts,educational,categories,authors,tags]=await Promise.all([editorialRepository.listPosts(),editorialRepository.listEducationalArticles(),editorialRepository.listCategories(),editorialRepository.listAuthors(),editorialRepository.listTags()]);const orderedPosts=posts.filter(item=>visible(item.status,item.scheduledAt)).sort(compareByRecency);return[...orderedPosts.map(item=>postToArticle(item,categories,authors,tags)),...educational.filter(item=>visible(item.status,item.scheduledAt)).map(item=>educationalToArticle(item,categories,authors,tags))]}
const eventDate=(start:string,end:string)=>{const a=new Date(`${start}T12:00:00`),b=new Date(`${end}T12:00:00`);return a.getMonth()===b.getMonth()?`${String(a.getDate()).padStart(2,"0")}–${String(b.getDate()).padStart(2,"0")}`:`${String(a.getDate()).padStart(2,"0")}/${a.getMonth()+1}–${String(b.getDate()).padStart(2,"0")}/${b.getMonth()+1}`};

export const localContentRepository: ContentRepository = {
  async listArticles(){return allArticles()},async getArticleBySlug(slug){return(await allArticles()).find(article=>article.slug===slug)},
  async listCompanies(){
    const[managed,counts]=await Promise.all([operationsRepository.listCompanies(),countPostsByCompanyName()]);
    return managed.filter(company=>company.active).map(company=>({name:company.name,slug:company.slug,ticker:company.ticker,sector:company.sector,description:company.description,website:company.website,accent:accentFor(company.slug),postCount:counts[company.name]??0,hasCoverage:(counts[company.name]??0)>0,active:company.active,featured:company.featured}));
  },
  async getCompanyBySlug(slug){return(await localContentRepository.listCompanies()).find(company=>company.slug===slug)},
  // Fase 8C (secao 19) — so eventos publicados, verificados e ainda nao
  // expirados aparecem ao publico; ordenados por start_date (data real do
  // evento), nao mais pelo displayOrder manual da fase anterior.
  async listEvents(){const items=await operationsRepository.listEvents();return items.filter(item=>item.showOnHome&&isVisibleToPublic(item)).sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(item=>({id:item.id,title:item.name,slug:item.slug,date:eventDate(item.startDate,item.endDate),month:item.month,location:`${item.city}, ${item.state}`,segment:item.segment,image:item.mainImage,imageAlt:item.imageAlt,startDate:item.startDate,endDate:item.endDate,venue:item.venue,address:item.address,expectedAudience:item.expectedAudience,exhibitors:item.exhibitors,description:item.description,whyFollow:item.whyFollow,opportunities:item.opportunities,ctaUrl:item.officialUrl,dataStatus:item.dataStatus,additionalImages:item.additionalImages,city:item.city,state:item.state,status:item.status,showOnHome:item.showOnHome,displayOrder:item.displayOrder,relatedEventIds:item.relatedEventIds,ctaLabel:item.ctaLabel}))},
  async listSegments(){return(await operationsRepository.listSegments()).sort((a,b)=>a.order-b.order).map(item=>item.name)},
  async listSegmentProfiles(){const[segments,counts]=await Promise.all([operationsRepository.listSegments(),countPostsBySegment()]);return segments.sort((a,b)=>a.order-b.order).map(item=>({name:item.name,slug:item.slug,image:item.image,imageAlt:item.imageAlt,articleCount:counts[item.slug]??0,description:item.description,icon:item.icon,order:item.order,showOnHome:item.showOnHome,metaTitle:item.metaTitle,metaDescription:item.metaDescription}))},
  // Fase 8D — só sinais/itens já publicados e ainda não expirados aparecem
  // ao público. A varredura de expiração já roda dentro de
  // operationsRepository.listRadarSignals()/listIntelligenceItems() (ver
  // Task 3) — aqui só filtramos por status "published".
  async listPublishedRadarSignals(){return(await operationsRepository.listRadarSignals()).filter(item=>item.status==="published").sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))},
  async listPublishedIntelligenceItems(){return(await operationsRepository.listIntelligenceItems()).filter(item=>item.status==="published").sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))},
};
