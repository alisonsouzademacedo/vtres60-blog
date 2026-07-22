import type { RadarSignal, RadarSignalStatus } from "@/types/operations";

export interface PublishValidationError { field: string; message: string }

export interface EvidenceContext {
  postIds: Set<string>;
  tagIds: Set<string>;
  segmentSlugs: Set<string>;
  companySlugs: Set<string>;
}

const PUBLISHABLE_PRIOR_STATUS = new Set<RadarSignalStatus>(["reviewed", "published"]);

type PublishInput = Pick<RadarSignal, "title" | "summary" | "evidencePostIds" | "sourceUrls" | "tagIds" | "segmentSlugs" | "companySlugs" | "validUntil" | "reviewedAt" | "status">;

/**
 * Fase 8D — regra server-side obrigatória de publicação do Radar Industrial.
 * Espelha src/lib/agenda/event-publish-rules.ts (Fase 8C): só valida
 * quando o estado FINAL desejado é "published"; nunca confia no client.
 * "Nenhum sinal pode ser publicado sem evidência real" (spec) é aplicado
 * aqui, não só sugerido na UI.
 */
export function validateRadarSignalPublication(next: PublishInput, current: Pick<RadarSignal, "status"> | undefined, context: EvidenceContext): PublishValidationError[] {
  if (next.status !== "published") return [];
  const errors: PublishValidationError[] = [];

  if (!next.title?.trim()) errors.push({ field: "title", message: "Título é obrigatório para publicar o sinal." });
  if (!next.summary?.trim()) errors.push({ field: "summary", message: "Resumo é obrigatório para publicar o sinal." });

  if (!next.evidencePostIds?.length) {
    errors.push({ field: "evidencePostIds", message: "Nenhum sinal pode ser publicado sem evidência real — selecione ao menos um post publicado." });
  } else {
    const invalid = next.evidencePostIds.filter((id) => !context.postIds.has(id));
    if (invalid.length) errors.push({ field: "evidencePostIds", message: `Post(s) inexistente(s) ou não publicados referenciados como evidência: ${invalid.join(", ")}.` });
  }

  if (!next.sourceUrls?.length) errors.push({ field: "sourceUrls", message: "Nenhuma fonte real associada — os posts de evidência precisam ter source_url." });

  const invalidTags = (next.tagIds ?? []).filter((id) => !context.tagIds.has(id));
  if (invalidTags.length) errors.push({ field: "tagIds", message: `Tag(s) inexistente(s): ${invalidTags.join(", ")}.` });

  const invalidSegments = (next.segmentSlugs ?? []).filter((slug) => !context.segmentSlugs.has(slug));
  if (invalidSegments.length) errors.push({ field: "segmentSlugs", message: `Segmento(s) inexistente(s): ${invalidSegments.join(", ")}.` });

  const invalidCompanies = (next.companySlugs ?? []).filter((slug) => !context.companySlugs.has(slug));
  if (invalidCompanies.length) errors.push({ field: "companySlugs", message: `Empresa(s) inexistente(s): ${invalidCompanies.join(", ")}.` });

  if (!next.validUntil) errors.push({ field: "validUntil", message: "Data de validade é obrigatória para publicar o sinal." });
  else if (new Date(next.validUntil).getTime() <= Date.now()) errors.push({ field: "validUntil", message: "Não é possível publicar um sinal já expirado — atualize a validade primeiro." });

  if (!next.reviewedAt) errors.push({ field: "reviewedAt", message: "Sinal precisa ser revisado antes de ser publicado." });

  const priorStatus = current?.status;
  if (!priorStatus || !PUBLISHABLE_PRIOR_STATUS.has(priorStatus)) {
    errors.push({
      field: "status",
      message: priorStatus
        ? `Não é possível publicar diretamente a partir do status "${priorStatus}" — revise o sinal primeiro.`
        : "Não é possível criar um sinal já publicado — revise antes.",
    });
  }

  return errors;
}
