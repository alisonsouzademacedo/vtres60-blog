import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
export default function Page(){return <><AdminPageHeading eyebrow="Empresas" title="Nova empresa" description="Cadastre uma empresa real acompanhada pela redação."/><OperationsEditor kind="company"/></>}
