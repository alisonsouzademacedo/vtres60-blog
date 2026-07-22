import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";
import { countPostsByCompanyName } from "@/repositories/local-content-repository";

export default async function Page(){
  const[companies,counts]=await Promise.all([operationsRepository.listCompanies(),countPostsByCompanyName()]);
  return <><AdminPageHeading eyebrow="Portal" title="Empresas" description="Empresas acompanhadas pela redação — só aparecem na Home quando há cobertura editorial real."/><CrudList initial={companies.map(item=>({id:item.id,title:item.name,slug:item.slug,meta:`${counts[item.name]??0} posts com cobertura · ${item.active?"Ativa":"Inativa"}${item.featured?" · Destacada":""}`}))} basePath="/admin/empresas" apiPath="/api/admin/companies" createLabel="Nova empresa" entityName="Empresa"/></>
}
