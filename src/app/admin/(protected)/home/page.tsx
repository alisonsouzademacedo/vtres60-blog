import { AdminPageHeading } from "@/components/admin/page-heading";
import { HomeForm } from "@/components/admin/home-form";
import { configRepository } from "@/services/config";
export default async function AdminHomePage(){const home=await configRepository.getHome();return <><AdminPageHeading eyebrow="Portal" title="Edição da Home" description="Controle a composição editorial, os textos, CTAs, filtros e a visibilidade dos módulos da página inicial."/><HomeForm initial={home}/></>}
