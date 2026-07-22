import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const signals=await operationsRepository.listRadarSignals();
  return <><AdminPageHeading eyebrow="Portal" title="Radar Industrial" description="Sinais editoriais com evidência real — nenhum é publicado sem revisão e fonte."/><CrudList initial={signals.map(item=>({id:item.id,title:item.title,slug:item.id,meta:`${item.evidencePostIds.length} evidência(s) · válido até ${new Date(item.validUntil).toLocaleDateString("pt-BR")}`,status:item.status}))} basePath="/admin/radar" apiPath="/api/admin/radar" createLabel="Novo sinal" entityName="Sinal"/></>
}
