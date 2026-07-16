import { deriveRunOutcome, hostnameOf } from "@/lib/agent/agent-run-outcome";
import { createRun, finishRun } from "@/lib/agent/agent-runs-repository";
import { isAgentRequestAuthorized } from "@/lib/agent/require-agent-auth";
import { agentGraph, type AgentState } from "@/lib/agent/workflow";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isAgentRequestAuthorized(request)) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limited = rateLimit(`agent-trigger:${ip}`, 5, 15 * 60 * 1000);
  if (limited.limited) {
    return Response.json({ error: "Muitas execuções recentes. Tente novamente em alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { sourceUrl?: string } | null;

  const startedAtMs = Date.now();
  // Fase 6 — mesma telemetria best-effort do cron/route.ts (ver comentario
  // la): agent_runs pode nao existir ainda em producao nesta fase.
  const run = await createRun({ triggerType: "manual" }).catch(() => undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      let lastState: AgentState | undefined;
      try {
        const iterator = await agentGraph.stream(
          { sourceUrl: body?.sourceUrl, runId: run?.id },
          // recursionLimit alinhado ao cron/route.ts: sem URL explicita
          // (descoberta automatica), o NextCandidate pode percorrer ate 10
          // candidatas antes de desistir, superando o default de 25.
          { streamMode: "values", recursionLimit: 60 },
        );
        for await (const chunk of iterator) {
          lastState = chunk;
          send({ currentStep: chunk.currentStep, publishedPostId: chunk.publishedPostId ?? null });
        }
        send({ done: true });
        if (run && lastState) {
          const outcome = deriveRunOutcome(lastState, undefined);
          await finishRun(run.id, {
            ...outcome,
            durationMs: Date.now() - startedAtMs,
            sourceName: hostnameOf(lastState.sourceUrl),
            draftAttempts: lastState.draftAttempts,
            materialUpdateReason: lastState.materialUpdateReason,
          }).catch(() => undefined);
        }
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Erro desconhecido no agente." });
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
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
