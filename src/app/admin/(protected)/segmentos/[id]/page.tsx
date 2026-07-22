import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
import { operationsRepository } from "@/services/operations";
import { countPostsBySegment } from "@/repositories/local-content-repository";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;const item=await operationsRepository.getSegment(id);if(!item)notFound();const counts=await countPostsBySegment();return <><AdminPageHeading eyebrow="Segmentos" title="Editar segmento" description={`Atualize “${item.name}” e sua presença editorial.`}/><OperationsEditor kind="segment" initial={item} realArticleCount={counts[item.slug]??0}/></>}
