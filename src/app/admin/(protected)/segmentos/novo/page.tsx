import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
export default function Page(){return <><AdminPageHeading eyebrow="Segmentos" title="Novo segmento" description="Crie uma nova vertical industrial e defina como ela aparece no portal."/><OperationsEditor kind="segment"/></>}
