import { AdminPageHeading } from "@/components/admin/page-heading";
import { BrandingForm } from "@/components/admin/branding-form";
import { configRepository } from "@/services/config";
export default async function BrandingPage(){const branding=await configRepository.getBranding();return <><AdminPageHeading eyebrow="Marca" title="Identidade Visual" description="Logos, arquivos de marca, cores e parâmetros visuais aplicados ao portal sem alteração de código."/><BrandingForm initial={branding}/></>}
