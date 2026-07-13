import { AdminPageHeading } from "@/components/admin/page-heading";
import { AgentConsole } from "@/components/admin/agent-console";
import { operationsRepository } from "@/services/operations";

export default async function Page() {
  const logs = await operationsRepository.listLogs();
  const history = logs.filter((item) => item.module === "agente");

  return (
    <>
      <AdminPageHeading
        eyebrow="Operação"
        title="Agente Autônomo"
        description="Envie uma notícia para o agente e acompanhe a redação, auditoria e publicação em tempo real."
      />
      <AgentConsole history={history} />
    </>
  );
}
