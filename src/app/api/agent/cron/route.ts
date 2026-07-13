import { after } from "next/server";
import { isAgentRequestAuthorized } from "@/lib/agent/require-agent-auth";
import { getOldestPendingUrl, markProcessed } from "@/lib/agent/queue-repository";
import { agentGraph } from "@/lib/agent/workflow";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Gatilho da execucao autonoma agendada (05h00 e 17h00). Este endpoint nao
 * agenda nada sozinho — o Next.js nao tem cron embutido — precisa de um
 * disparador externo batendo aqui duas vezes ao dia. Configuramos o
 * cron-job.org (cron-job.org, plano gratuito, timeout maximo de 30s):
 *
 *   POST https://www.vtres60.com.br/blog/api/agent/cron
 *   Header: Authorization: Bearer <AGENT_API_KEY>
 *   Schedule: 0 5,17 * * * (America/Sao_Paulo)
 *
 * IMPORTANTE sobre o timeout: o pipeline completo (varias chamadas de LLM,
 * scraping, auditoria com ate 3 tentativas) costuma passar de 30s. Por
 * isso esta rota responde 202 IMEDIATAMENTE e roda o grafo em segundo
 * plano via after() do Next.js — assim o disparador externo nunca ve
 * timeout, mesmo que a execucao real leve minutos. after() e a API certa
 * pra isso (funciona tanto em servidor proprio quanto em serverless,
 * diferente de so nao dar `await` na promise, que so seria seguro aqui
 * porque o processo e persistente).
 *
 * Como a resposta HTTP nao carrega mais o resultado real, sucesso/falha da
 * execucao em segundo plano fica registrado em operationsRepository.log()
 * — visivel em /admin/logs.
 *
 * Prioridade: se houver link pendente em agent_queue, processa ele
 * (marcado como "processed" antes de rodar o grafo, para nao reprocessar
 * o mesmo link no proximo disparo caso a execucao falhe no meio). Sem
 * link pendente, roda o grafo sem sourceUrl — o PriorityRouter cai no
 * NewsFetcher.
 *
 * autoPublish: true — diferente do /api/agent/trigger (fluxo manual do
 * admin), esta execucao e 100% autonoma: aprovado na auditoria, publica
 * direto. Ver publisher.ts para a regra completa.
 */
async function runAgentInBackground() {
  const { operationsRepository } = await import("@/services/operations");
  const pending = await getOldestPendingUrl();
  if (pending) {
    await markProcessed(pending.id);
  }

  try {
    const finalState = await agentGraph.invoke({
      sourceUrl: pending?.url,
      queueItemId: pending?.id,
      autoPublish: true,
    });
    await operationsRepository.log(
      "execução",
      "agente",
      `Execução agendada (${pending ? "fila" : "RSS"}) concluída: ${finalState.currentStep}` +
        (finalState.publishedPostId ? ` — post ${finalState.publishedPostId}` : ""),
    );
  } catch (error) {
    await operationsRepository.log(
      "erro",
      "agente",
      `Execução agendada (${pending ? "fila" : "RSS"}) falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
  }
}

export async function POST(request: Request) {
  if (!isAgentRequestAuthorized(request)) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limited = rateLimit(`agent-cron:${ip}`, 10, 60 * 60 * 1000);
  if (limited.limited) {
    return Response.json({ error: "Muitas execuções recentes." }, { status: 429 });
  }

  after(runAgentInBackground);

  return Response.json(
    { ok: true, status: "accepted", message: "Execução do agente iniciada em segundo plano." },
    { status: 202 },
  );
}
