import type { MetadataRoute } from "next";
import { configRepository } from "@/services/config";
import { publicPath } from "@/lib/seo";
export default async function manifest():Promise<MetadataRoute.Manifest>{const[settings,branding]=await Promise.all([configRepository.getSettings(),configRepository.getBranding()]);return{name:settings.portalName,short_name:settings.portalName.split(" ")[0],description:settings.institutionalDescription,start_url:publicPath("/"),scope:publicPath("/"),display:"standalone",background_color:branding.colors.darkBackground,theme_color:branding.colors.darkBackground,icons:[{src:publicPath(branding.favicon),sizes:"any",type:branding.favicon.endsWith(".svg")?"image/svg+xml":"image/png"}]}}
