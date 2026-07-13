import type { MetadataRoute } from "next";
import { configRepository } from "@/services/config";
export default async function robots():Promise<MetadataRoute.Robots>{const seo=await configRepository.getSeo();return{rules:seo.robotsEnabled?{userAgent:"*",allow:"/",disallow:["/api/","/admin/","/buscar"]}:{userAgent:"*",disallow:"/"},sitemap:seo.sitemapEnabled?`${seo.canonicalBaseUrl}/sitemap.xml`:undefined,host:seo.canonicalBaseUrl}}
