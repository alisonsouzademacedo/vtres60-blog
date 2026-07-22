import { AdminPageHeading } from "@/components/admin/page-heading";
import { IntelligenceEditor } from "@/components/admin/intelligence-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const[signals,posts,segments,companies]=await Promise.all([operationsRepository.listRadarSignals(),editorialRepository.listPosts(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  return <><AdminPageHeading eyebrow="Inteligência" title="Novo item" description="Todo item precisa referenciar um sinal real do Radar."/><IntelligenceEditor signals={signals.filter(s=>s.status==="published")} posts={posts.filter(p=>p.status==="published")} segments={segments} companies={companies}/></>
}
