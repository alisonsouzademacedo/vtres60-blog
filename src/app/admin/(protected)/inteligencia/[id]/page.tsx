import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { IntelligenceEditor } from "@/components/admin/intelligence-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const[item,signals,posts,segments,companies]=await Promise.all([operationsRepository.getIntelligenceItem(id),operationsRepository.listRadarSignals(),editorialRepository.listPosts(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  if(!item)notFound();
  return <><AdminPageHeading eyebrow="Inteligência" title="Editar item" description={`Atualize “${item.title}”.`}/><IntelligenceEditor initial={item} signals={signals.filter(s=>s.status==="published")} posts={posts.filter(p=>p.status==="published")} segments={segments} companies={companies}/></>
}
