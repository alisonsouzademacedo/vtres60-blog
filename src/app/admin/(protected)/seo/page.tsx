import { AdminPageHeading } from "@/components/admin/page-heading";
import { SeoForm } from "@/components/admin/seo-form";
import { configRepository } from "@/services/config";
export default async function SeoPage(){const seo=await configRepository.getSeo();return <><AdminPageHeading eyebrow="Descoberta orgânica" title="SEO Global" description="Metadados padrão, indexação, tracking e dados estruturados compartilhados por todo o portal."/><SeoForm initial={seo}/></>}
