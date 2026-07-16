import { z } from "zod";
import { llm } from "../llm";
import { invokeWithUsageTelemetry } from "../costs/record-llm-usage";
import { operationsRepository } from "@/services/operations";
import { NEWSWORTHINESS_SYSTEM_PROMPT } from "../prompts";
import type { AgentState, AgentStateUpdate } from "../state";

const NewsworthinessSchema = z.object({
  isNewsworthy: z.boolean().describe("true somente se o texto descreve um evento, dado, decisão ou mudança temporal identificável"),
  newsworthinessReason: z.string().describe("Justificativa objetiva da decisão, em uma ou duas frases"),
  eventDateOrPeriod: z
    .string()
    .nullable()
    .describe("Data ou período do fato, se identificável no texto (ex: '6 de julho de 2026', 'primeiro semestre de 2026'). null se não houver período verificável."),
});

/**
 * NewsworthinessGate — roda logo apos o ContentExtractor (precisa de
 * sourceText real, nao so do titulo/descricao curtos do GNews, para
 * julgar com confiabilidade e para funcionar igualmente no fluxo manual
 * de admin, onde nao ha titulo/descricao do GNews antes da extracao).
 *
 * Preferido a rodar ANTES do ContentExtractor (economizaria o scraping)
 * porque precisa funcionar identicamente nos dois pontos de entrada do
 * grafo (NewsFetcher e URL manual via /api/agent/trigger) — so o
 * ContentExtractor garante sourceText em ambos. O custo do scraping
 * (fetch HTTP + Readability, sem LLM) e pequeno comparado ao de rodar o
 * ciclo completo Drafter/InternalAuditor/ImageProcessor numa pauta que
 * sera descartada — que e o desperdicio que esta posicao evita.
 */
export async function newsworthinessNode(state: AgentState): Promise<AgentStateUpdate> {
  const judge = llm.withStructuredOutput(NewsworthinessSchema, { includeRaw: true });
  const result = await invokeWithUsageTelemetry({ runId: state.runId, operation: "newsworthiness", modelRequested: "gpt-4o" }, () =>
    judge.invoke([
      { role: "system", content: NEWSWORTHINESS_SYSTEM_PROMPT },
      { role: "user", content: `URL: ${state.sourceUrl ?? "desconhecida"}\n\nTEXTO EXTRAÍDO:\n${state.sourceText}` },
    ]),
  );

  await operationsRepository.log(
    "newsworthiness",
    "agente",
    `URL ${state.sourceUrl ?? "desconhecida"} | isNewsworthy=${result.isNewsworthy} | reason=${result.newsworthinessReason} | eventDateOrPeriod=${result.eventDateOrPeriod ?? "null"}`,
  );

  if (!result.isNewsworthy) {
    return {
      isNewsworthy: false,
      newsworthinessReason: result.newsworthinessReason,
      eventDateOrPeriod: result.eventDateOrPeriod ?? undefined,
      currentStep: "Pauta descartada — não representa fato noticiável (not_newsworthy).",
    };
  }

  return {
    isNewsworthy: true,
    newsworthinessReason: result.newsworthinessReason,
    eventDateOrPeriod: result.eventDateOrPeriod ?? undefined,
    currentStep: "Pauta validada como noticiável — redigindo...",
  };
}
