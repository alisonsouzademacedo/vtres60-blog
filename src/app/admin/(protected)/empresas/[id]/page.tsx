import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
import { operationsRepository } from "@/services/operations";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;const item=await operationsRepository.getCompany(id);if(!item)notFound();return <><AdminPageHeading eyebrow="Empresas" title="Editar empresa" description={`Atualize “${item.name}”.`}/><OperationsEditor kind="company" initial={item}/></>}
