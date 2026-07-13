const trimEnd = (value: string) => value.replace(/\/+$/, "");

export const siteUrl = trimEnd(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.vtres60.com.br/blog");
export const basePath = trimEnd(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
export const absoluteUrl = (path:string) => `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
export const publicPath = (path: string) => `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
export const breadcrumbSchema = (items:{name:string;url:string}[]) => ({
  "@type":"BreadcrumbList",
  itemListElement:items.map((item,index)=>({"@type":"ListItem",position:index+1,name:item.name,item:absoluteUrl(item.url)})),
});
