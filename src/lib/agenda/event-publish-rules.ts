import type { EventDataStatus, EventStatus, ManagedEvent } from "@/types/operations";

/**
 * Fechamento Fase 8C (seção 7-8) — regra server-side obrigatória de
 * publicação. Confirmado por leitura direta de código que
 * src/app/api/admin/events/route.ts (POST) e [id]/route.ts (PATCH) só
 * validavam presença de name/slug/description/startDate/endDate — nada
 * impedia marcar status="published" com dataStatus="unverified" e sem
 * verifiedAt via chamada direta à API (o aviso em operations-editor.tsx
 * era só visual, no cliente). Esta função é a única fonte da regra,
 * chamada pelas duas rotas — nunca confia no client.
 */
export interface PublishValidationError {
  field: string;
  message: string;
}

const PUBLISHABLE_DATA_STATUS = new Set<EventDataStatus>(["official_verified", "manual_verified"]);
const PUBLISHABLE_PRIOR_STATUS = new Set<EventStatus>(["verified", "published"]);

type PublishInput = Pick<ManagedEvent, "name" | "startDate" | "endDate" | "officialUrl" | "dataStatus" | "verifiedAt" | "status">;

/**
 * A regra só entra em ação quando o estado FINAL desejado é "published"
 * — atualizações para candidate/verified/archived/cancelled (incluindo
 * arquivamento e cancelamento) não passam por aqui, mesmo saindo de um
 * estado published anterior.
 */
export function validateEventPublication(next: PublishInput, current: Pick<ManagedEvent, "status"> | undefined): PublishValidationError[] {
  if (next.status !== "published") return [];

  const errors: PublishValidationError[] = [];

  if (!next.name?.trim()) errors.push({ field: "name", message: "Nome é obrigatório para publicar o evento." });
  if (!next.startDate) errors.push({ field: "startDate", message: "Data inicial é obrigatória para publicar o evento." });
  if (!next.endDate) errors.push({ field: "endDate", message: "Data final é obrigatória para publicar o evento." });
  if (next.startDate && next.endDate && next.endDate < next.startDate) {
    errors.push({ field: "endDate", message: "Data final não pode ser anterior à data inicial." });
  }
  if (!next.officialUrl?.trim()) errors.push({ field: "officialUrl", message: "Link oficial é obrigatório para publicar o evento." });
  if (!next.dataStatus || !PUBLISHABLE_DATA_STATUS.has(next.dataStatus)) {
    errors.push({ field: "dataStatus", message: "Evento ainda não verificado não pode ser publicado — confirme a fonte oficial primeiro." });
  }
  if (!next.verifiedAt) errors.push({ field: "verifiedAt", message: "Data de verificação é obrigatória para publicar o evento." });

  const priorStatus = current?.status;
  if (!priorStatus || !PUBLISHABLE_PRIOR_STATUS.has(priorStatus)) {
    errors.push({
      field: "status",
      message: priorStatus
        ? `Não é possível publicar diretamente a partir do status "${priorStatus}" — o evento precisa ser verificado primeiro.`
        : "Não é possível criar um evento já publicado — o evento precisa ser verificado primeiro.",
    });
  }

  return errors;
}
