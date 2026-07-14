const trimEnd = (value: string) => value.replace(/\/+$/, "");

export const siteUrl = trimEnd(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vtres60.com.br/blog");
export const basePath = trimEnd(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
// Fase 6 — BUG REAL confirmado com dado de producao: featured_image de
// posts reais ja vem como URL absoluta (Supabase Storage apos a Fase 4, ou
// hotlink externo direto de posts anteriores). Sem este guard,
// absoluteUrl() reprefixava qualquer URL ja absoluta com siteUrl,
// quebrando og:image/JSON-LD image em TODO post publicado
// (ex: "https://www.vtres60.com.br/blog/https://xxx.supabase.co/...").
const isAbsoluteUrl = (value: string) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(value);
export const absoluteUrl = (path: string) => (isAbsoluteUrl(path) ? path : `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`);
export const publicPath = (path: string) => `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
export const breadcrumbSchema = (items:{name:string;url:string}[]) => ({
  "@type":"BreadcrumbList",
  itemListElement:items.map((item,index)=>({"@type":"ListItem",position:index+1,name:item.name,item:absoluteUrl(item.url)})),
});
