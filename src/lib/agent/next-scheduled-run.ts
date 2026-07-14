// Fase 6 — 05:00 e 17:00 America/Sao_Paulo, em UTC. Brasil aboliu o
// horario de verao em 2019 (Decreto 9.772/2019) — o offset e sempre -03:00,
// entao esses valores fixos em UTC (08:00 e 20:00) nao driftam ao longo do
// ano, diferente de fusos com DST. Ver agent-worker.mjs para o schedule
// real configurado no PM2.
const SCHEDULED_HOURS_UTC = [8, 20];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Proxima execucao agendada do cron do agente, estritamente APOS `now`
 * (se `now` cair exatamente num horario agendado, considera que aquele
 * disparo ja aconteceu e retorna o proximo). Usado pelo painel
 * Admin -> Operacao do Agente para mostrar "proxima execucao calculada".
 */
export function nextScheduledRun(now: Date = new Date()): Date {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const hour of SCHEDULED_HOURS_UTC) {
      const candidate = new Date(dayStart + dayOffset * DAY_MS + hour * 60 * 60 * 1000);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  // Inalcancavel: o loop cobre uma janela de 48h a partir da meia-noite de
  // hoje, sempre contendo ao menos um horario estritamente futuro.
  throw new Error("nextScheduledRun: não foi possível calcular a próxima execução.");
}
