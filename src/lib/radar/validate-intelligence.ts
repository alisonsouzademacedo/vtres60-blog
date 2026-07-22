import type { IntelligenceItem, IntelligenceStatus } from "@/types/operations";
import type { EvidenceContext } from "./validate-signal";

export interface PublishValidationError { field: string; message: string }

const PUBLISHABLE_PRIOR_STATUS = new Set<IntelligenceStatus>(["reviewed", "published"]);

type PublishInput = Pick<IntelligenceItem, "radarSignalId" | "kind" | "title" | "analysis" | "recommendedAction" | "evidencePostIds" | "sourceUrls" | "segmentSlugs" | "companySlugs" | "validUntil" | "reviewedAt" | "status">;

/**
 * Fase 8D — regra server-side de publicação da Inteligência VTRES60.
 * "Não apresentar recomendação como notícia" (spec) é aplicado aqui: um
 * item kind="recommendation" sem recommended_action não é uma
 * recomendação de verdade, só um fato disfarçado — bloqueado.
 * "Reconstruir a partir dos sinais do Radar" (spec) é aplicado exigindo
 * um radar_signal_id que exista de fato, nunca um id solto.
 */
export function validateIntelligencePublication(
  next: PublishInput,
  current: Pick<IntelligenceItem, "status"> | undefined,
  context: EvidenceContext,
  realRadarSignalIds: Set<string>,
): PublishValidationError[] {
  if (next.status !== "published") return [];
  const errors: PublishValidationError[] = [];

  if (!next.radarSignalId || !realRadarSignalIds.has(next.radarSignalId)) {
    errors.push({ field: "radarSignalId", message: "Todo item de Inteligência precisa referenciar um sinal real do Radar." });
  }
  if (!next.title?.trim()) errors.push({ field: "title", message: "Título é obrigatório para publicar." });
  if (!next.analysis?.trim()) errors.push({ field: "analysis", message: "Análise é obrigatória para publicar." });
  if (next.kind === "recommendation" && !next.recommendedAction?.trim()) {
    errors.push({ field: "recommendedAction", message: "Uma recomendação sem ação recomendada não pode ser publicada como recomendação." });
  }

  if (!next.evidencePostIds?.length) {
    errors.push({ field: "evidencePostIds", message: "Nenhum item pode ser publicado sem evidência real — selecione ao menos um post publicado." });
  } else {
    const invalid = next.evidencePostIds.filter((id) => !context.postIds.has(id));
    if (invalid.length) errors.push({ field: "evidencePostIds", message: `Post(s) inexistente(s) ou não publicados: ${invalid.join(", ")}.` });
  }
  if (!next.sourceUrls?.length) errors.push({ field: "sourceUrls", message: "Nenhuma fonte real associada." });

  const invalidSegments = (next.segmentSlugs ?? []).filter((slug) => !context.segmentSlugs.has(slug));
  if (invalidSegments.length) errors.push({ field: "segmentSlugs", message: `Segmento(s) inexistente(s): ${invalidSegments.join(", ")}.` });
  const invalidCompanies = (next.companySlugs ?? []).filter((slug) => !context.companySlugs.has(slug));
  if (invalidCompanies.length) errors.push({ field: "companySlugs", message: `Empresa(s) inexistente(s): ${invalidCompanies.join(", ")}.` });

  if (!next.validUntil) errors.push({ field: "validUntil", message: "Data de validade é obrigatória." });
  else if (new Date(next.validUntil).getTime() <= Date.now()) errors.push({ field: "validUntil", message: "Não é possível publicar um item já expirado." });

  if (!next.reviewedAt) errors.push({ field: "reviewedAt", message: "Item precisa ser revisado antes de ser publicado." });

  const priorStatus = current?.status;
  if (!priorStatus || !PUBLISHABLE_PRIOR_STATUS.has(priorStatus)) {
    errors.push({
      field: "status",
      message: priorStatus ? `Não é possível publicar diretamente a partir do status "${priorStatus}".` : "Não é possível criar um item já publicado — revise antes.",
    });
  }

  return errors;
}
