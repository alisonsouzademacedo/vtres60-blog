import { after } from "next/server";
import { deriveRunOutcome, hostnameOf } from "@/lib/agent/agent-run-outcome";
import { createRun, finishRun } from "@/lib/agent/agent-runs-repository";
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

  const startedAtMs = Date.now();
  // Fase 6 — scheduled_for: cron-job.org dispara em ate poucos segundos do
  // horario configurado (05:00/17:00 America/Sao_Paulo); arredondar "agora"
  // para o minuto e uma aproximacao honesta do horario agendado, sem
  // precisar de uma tabela de configuracao de cron separada so pra isso.
  //
  // .catch(() => undefined): agent_runs e telemetria BEST-EFFORT — a
  // migration (supabase-agent-runs-schema.sql) ainda nao foi aplicada em
  // producao nesta fase (Fase 6 nao aplica migration remota). Se a tabela
  // nao existir ainda, createRun falha silenciosamente e `run` fica
  // undefined; o pipeline real (operationsRepository.log, ja existente)
  // continua funcionando normalmente e nao trava esperando telemetria.
  // Assim que a migration for aplicada num deploy futuro, a telemetria
  // passa a funcionar sem nenhuma mudanca de codigo adicional.
  const scheduledFor = new Date(Math.round(startedAtMs / 60_000) * 60_000).toISOString();
  const run = await createRun({ triggerType: "cron", scheduledFor }).catch(() => undefined);

  try {
    const finalState = await agentGraph.invoke(
      {
        sourceUrl: pending?.url,
        queueItemId: pending?.id,
        autoPublish: true,
        runId: run?.id,
      },
      // Fase 6 — NextCandidate pode fazer o grafo percorrer ate 10
      // candidatas do GNews (NewsFetcher) antes de desistir, cada uma
      // passando por varios nos; o default do LangGraph (25 supersteps)
      // estoura nesse pior caso e derruba a execucao com
      // GraphRecursionError antes de esgotar a fila de fallback.
      { recursionLimit: 60 },
    );
    await operationsRepository.log(
      "execução",
      "agente",
      `Execução agendada (${pending ? "fila" : "RSS"}) concluída: ${finalState.currentStep}` +
        (finalState.publishedPostId ? ` — post ${finalState.publishedPostId}` : ""),
    );
    if (run) {
      const outcome = deriveRunOutcome(finalState, undefined);
      await finishRun(run.id, {
        ...outcome,
        durationMs: Date.now() - startedAtMs,
        sourceName: hostnameOf(finalState.sourceUrl),
        draftAttempts: finalState.draftAttempts,
        materialUpdateReason: finalState.materialUpdateReason,
      }).catch(() => undefined);
    }
  } catch (error) {
    await operationsRepository.log(
      "erro",
      "agente",
      `Execução agendada (${pending ? "fila" : "RSS"}) falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    );
    if (run) {
      await finishRun(run.id, {
        status: "failed",
        terminalReason: "operational_error",
        candidatesTried: 1,
        candidatesFound: 0,
        candidateHistory: [],
        durationMs: Date.now() - startedAtMs,
        providerErrors: { agent: error instanceof Error ? error.message : "erro desconhecido" },
      }).catch(() => undefined);
    }
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
