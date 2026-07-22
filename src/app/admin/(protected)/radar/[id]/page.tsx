import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { RadarEditor } from "@/components/admin/radar-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const[item,posts,tags,segments,companies]=await Promise.all([operationsRepository.getRadarSignal(id),editorialRepository.listPosts(),editorialRepository.listTags(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  if(!item)notFound();
  return <><AdminPageHeading eyebrow="Radar" title="Editar sinal" description={`Atualize “${item.title}”.`}/><RadarEditor initial={item} posts={posts.filter(p=>p.status==="published")} tags={tags} segments={segments} companies={companies}/></>
}
