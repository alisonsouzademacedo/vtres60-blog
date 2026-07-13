import { isAgentRequestAuthorized } from "@/lib/agent/require-agent-auth";
import { agentGraph } from "@/lib/agent/workflow";
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const iterator = await agentGraph.stream(
          { sourceUrl: body?.sourceUrl },
          { streamMode: "values" },
        );
        for await (const chunk of iterator) {
          send({ currentStep: chunk.currentStep, publishedPostId: chunk.publishedPostId ?? null });
        }
        send({ done: true });
      } catch (error) {
        send({ error: error instanceof Error ? error.message : "Erro desconhecido no agente." });
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
