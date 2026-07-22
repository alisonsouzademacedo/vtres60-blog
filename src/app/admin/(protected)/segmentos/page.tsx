import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";
import { countPostsBySegment } from "@/repositories/local-content-repository";

export default async function Page(){
  const[segments,counts]=await Promise.all([operationsRepository.listSegments(),countPostsBySegment()]);
  return <><AdminPageHeading eyebrow="Portal" title="Segmentos Industriais" description="Organize os setores acompanhados, suas imagens, ordem editorial e metadados de busca."/><CrudList initial={segments.sort((a,b)=>a.order-b.order).map(item=>({id:item.id,title:item.name,slug:item.slug,meta:`${counts[item.slug]??0} notícias publicadas · ${item.showOnHome?"Na Home":"Oculto da Home"}`}))} basePath="/admin/segmentos" apiPath="/api/admin/segments" createLabel="Novo segmento" entityName="Segmento"/></>
}
