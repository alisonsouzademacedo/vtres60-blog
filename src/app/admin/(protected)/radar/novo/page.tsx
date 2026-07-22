import { AdminPageHeading } from "@/components/admin/page-heading";
import { RadarEditor } from "@/components/admin/radar-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const[posts,tags,segments,companies]=await Promise.all([editorialRepository.listPosts(),editorialRepository.listTags(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  return <><AdminPageHeading eyebrow="Radar" title="Novo sinal" description="Selecione evidência real — nenhuma fonte é digitada livremente."/><RadarEditor posts={posts.filter(p=>p.status==="published")} tags={tags} segments={segments} companies={companies}/></>
}
