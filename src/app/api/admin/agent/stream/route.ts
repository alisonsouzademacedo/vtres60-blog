import { requireAdmin } from "@/lib/admin-api";
import { agentGraph } from "@/lib/agent/workflow";

/**
 * SSE para o terminal ao vivo do painel admin (AgentConsole). Autenticado
 * pelo COOKIE de sessao do admin (requireAdmin), nao pelo Bearer token de
 * /api/agent/trigger e /api/agent/cron — o EventSource nativo do browser
 * nao consegue enviar header Authorization customizado, e colocar
 * AGENT_API_KEY em codigo client-side vazaria um segredo de servidor no
 * bundle do navegador. Por isso esta rota existe separada das
 * machine-to-machine, reaproveitando a auth que o resto do /api/admin/*
 * ja usa.
 *
 * `sourceUrl` e opcional: se vier preenchido (botao "Gerar Noticia Deste
 * Link Agora"), forca o LangGraph a processar exatamente essa URL. Se vier
 * vazio (botao "Gerar Noticia Agora"), roda sem sourceUrl — o
 * PriorityRouter cai no NewsFetcher (GNews), simulando o que o cron faria,
 * mas sob supervisao humana em tempo real. Esta rota NUNCA grava em
 * agent_queue — isso e responsabilidade exclusiva de
 * /api/admin/agent/queue (botao "Adicionar a Fila"), para nao confundir
 * "rodar agora" com "agendar para o proximo Cron".
 *
 * autoPublish: true — igual ao /api/agent/cron. O disparo manual (admin
 * colando um link ou forcando busca) e uma execucao imediata do MESMO
 * pipeline agendado, nao uma revisao editorial: se a auditoria aprovar,
 * publica direto, sem espera por aprovacao humana. A auditoria (ver
 * internal-auditor.ts) e o unico portao de qualidade — se reprovar apos
 * todas as tentativas, publisher.ts ainda cai em rascunho de emergencia
 * de qualquer forma, independente de autoPublish. Ver publisher.ts.
 *
 * Cada execucao e registrada em operationsRepository ("agente"), a mesma
 * trilha usada pelo Cron, para que /admin/agente (aba Historico de
 * Execucoes) mostre rodadas manuais e agendadas lado a lado.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { sourceUrl?: string } | null;
  const sourceUrl = body?.sourceUrl?.trim() || undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const { operationsRepository } = await import("@/services/operations");
      const origin = sourceUrl ? `link direto: ${sourceUrl}` : "busca automática";
      let lastStep = "";
      let publishedPostId: string | null = null;
      try {
        const iterator = await agentGraph.stream({ sourceUrl, autoPublish: true }, { streamMode: "values" });
        for await (const chunk of iterator) {
          lastStep = chunk.currentStep ?? lastStep;
          publishedPostId = chunk.publishedPostId ?? publishedPostId;
          send({ currentStep: chunk.currentStep, publishedPostId: chunk.publishedPostId ?? null });
        }
        send({ done: true });
        await operationsRepository.log(
          "execução",
          "agente",
          `Execução manual (${origin}) concluída: ${lastStep}` + (publishedPostId ? ` — post ${publishedPostId}` : ""),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido no agente.";
        send({ error: message });
        await operationsRepository.log("erro", "agente", `Execução manual (${origin}) falhou: ${message}`);
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
