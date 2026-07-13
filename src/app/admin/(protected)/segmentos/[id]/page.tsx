import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
import { operationsRepository } from "@/services/operations";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;const item=await operationsRepository.getSegment(id);if(!item)notFound();return <><AdminPageHeading eyebrow="Segmentos" title="Editar segmento" description={`Atualize “${item.name}” e sua presença editorial.`}/><OperationsEditor kind="segment" initial={item}/></>}
