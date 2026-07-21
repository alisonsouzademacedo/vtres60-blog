import type { EventStatus, ManagedEvent } from "@/types/operations";

/**
 * Fase 8C (secao 17) — expiracao automatica: evento publicado cujo
 * end_date ja passou vira "archived". Comparacao e feita por DATA (nao
 * datetime), no fuso America/Sao_Paulo, porque start_date/end_date sao
 * campos date-only ("2026-08-14") — comparar isso contra um Date UTC
 * completo criaria um erro de fuso perto da meia-noite (evento apareceria
 * "expirado" ~3h antes da meia-noite real em Brasilia, ou o contrario).
 */
const TIMEZONE = "America/Sao_Paulo";

/** Data local (America/Sao_Paulo) de "agora", como string YYYY-MM-DD. */
export function todayInSaoPaulo(reference: Date = new Date()): string {
  return reference.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/** true quando o evento ja passou da data final, comparando so a parte de data. */
export function isEventExpired(event: Pick<ManagedEvent, "endDate">, reference: Date = new Date()): boolean {
  return event.endDate < todayInSaoPaulo(reference);
}

/**
 * Aplica a regra de arquivamento: so eventos "published" com endDate no
 * passado viram "archived" — candidatos/verificados/ja arquivados/
 * cancelados nunca sao tocados por esta funcao (arquivamento automatico e
 * so para o que estava efetivamente publicado e visivel).
 */
export function computeNextStatus(event: Pick<ManagedEvent, "status" | "endDate">, reference: Date = new Date()): EventStatus {
  if (event.status === "published" && isEventExpired(event, reference)) return "archived";
  return event.status;
}

/** Home/agenda publica: so eventos publicados, verificados e ainda nao expirados. */
export function isVisibleToPublic(event: Pick<ManagedEvent, "status" | "endDate">, reference: Date = new Date()): boolean {
  return event.status === "published" && !isEventExpired(event, reference);
}

/**
 * Aplica o arquivamento a uma lista de eventos, retornando so os que
 * mudaram de status (para o chamador decidir se persiste ou nao).
 * Nao exclui nada — evento arquivado continua acessivel no admin, so
 * some da home/proximo-evento (ver isVisibleToPublic).
 */
export function archiveExpiredEvents<T extends Pick<ManagedEvent, "id" | "status" | "endDate">>(
  events: T[],
  reference: Date = new Date(),
): { id: string; nextStatus: EventStatus }[] {
  const changes: { id: string; nextStatus: EventStatus }[] = [];
  for (const event of events) {
    const next = computeNextStatus(event, reference);
    if (next !== event.status) changes.push({ id: event.id, nextStatus: next });
  }
  return changes;
}
