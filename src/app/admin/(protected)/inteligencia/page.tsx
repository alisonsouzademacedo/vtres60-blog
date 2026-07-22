import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const items=await operationsRepository.listIntelligenceItems();
  return <><AdminPageHeading eyebrow="Portal" title="Inteligência VTRES60" description="Fatos, análises e recomendações — sempre derivados de um sinal real do Radar."/><CrudList initial={items.map(item=>({id:item.id,title:item.title,slug:item.id,meta:`${item.kind==="fact"?"Fato":item.kind==="analysis"?"Análise":"Recomendação"} · ${item.evidencePostIds.length} evidência(s)`,status:item.status}))} basePath="/admin/inteligencia" apiPath="/api/admin/intelligence" createLabel="Novo item" entityName="Item"/></>
}
