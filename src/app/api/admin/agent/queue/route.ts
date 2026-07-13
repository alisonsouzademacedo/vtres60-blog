import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { enqueueUrl } from "@/lib/agent/queue-repository";

/**
 * Enfileira uma URL em agent_queue SEM executar o agente agora — o proximo
 * disparo do Cron (/api/agent/cron, 05h/17h) e que vai processa-la. Rota
 * separada de /api/admin/agent/stream de proposito: aquela roda o LangGraph
 * na hora (streaming); esta so grava a fila. Botao "Adicionar a Fila" no
 * AgentConsole usa esta rota; "Gerar Noticia Deste Link Agora" usa a outra.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { sourceUrl?: string } | null;
  const sourceUrl = body?.sourceUrl?.trim();
  if (!sourceUrl) return apiError(new Error("Informe a URL da notícia."), 400);

  try {
    const item = await enqueueUrl(sourceUrl);
    const { operationsRepository } = await import("@/services/operations");
    await operationsRepository.log("fila", "agente", `Link adicionado à fila para a próxima execução agendada: ${sourceUrl}`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
