import { notFound } from "next/navigation";
import { BudgetPanel } from "@/components/admin/budget-panel";
import "../../admin/admin.css";

// Fase 9B.0 (fechamento) — harness de fixtures SOMENTE para Playwright/axe
// validarem estados do BudgetPanel que não existem no Supabase real (a
// migration não foi aplicada em produção — proibido nesta fase). Fica
// deliberadamente FORA de /admin/* — o middleware (src/middleware.ts)
// exige cookie de sessão para qualquer path sob /admin/:path*, e este
// harness não deve herdar (nem contornar) essa exigência: é só um
// renderizador de fixtures, não uma tela administrativa de verdade. Nunca
// acessível fora de um servidor de teste explicitamente marcado: 404 em
// qualquer ambiente onde PLAYWRIGHT_TEST_FIXTURES!=="1" (nunca setado em
// produção, só exportado pelo script que sobe o servidor isolado de
// e2e/budget-panel-fixtures.spec.ts). Renderiza BudgetPanel puro — o
// componente em si não sabe nem se importa de onde vêm as props.

const now = new Date().toISOString();
const soon = new Date(Date.now() + 3600_000).toISOString();

const SCENARIOS = {
  disabled: {
    available: true,
    modes: [
      { provider: "openai" as const, mode: "DISABLED" as const },
      { provider: "gnews" as const, mode: "DISABLED" as const },
      { provider: "replicate" as const, mode: "DISABLED" as const },
      { provider: "pexels" as const, mode: "DISABLED" as const },
      { provider: "supabase" as const, mode: "DISABLED" as const },
    ],
    thresholds: [],
    spend: [
      { provider: "openai" as const, dailySpent: 0.043, monthlySpent: 1.29, openReservations: 0, lastBlockedAt: undefined, lastBlockReason: undefined },
    ],
    recentBlocks: [],
  },
  audit_with_threshold: {
    available: true,
    modes: [{ provider: "openai" as const, mode: "AUDIT" as const }],
    thresholds: [
      { provider: "openai" as const, scope: "daily" as const, limitType: "MONETARY_BUDGET" as const, approvedThreshold: 5, recommendedThreshold: 3, currency: "USD" },
    ],
    spend: [{ provider: "openai" as const, dailySpent: 0.21, monthlySpent: 4.5, openReservations: 1, lastBlockedAt: undefined, lastBlockReason: undefined }],
    recentBlocks: [],
  },
  enforce_with_blocks: {
    available: true,
    modes: [{ provider: "openai" as const, mode: "ENFORCE" as const }],
    thresholds: [
      { provider: "openai" as const, scope: "daily" as const, limitType: "MONETARY_BUDGET" as const, approvedThreshold: 1, recommendedThreshold: undefined, currency: "USD" },
      { provider: "openai" as const, scope: "monthly" as const, limitType: "MONETARY_BUDGET" as const, approvedThreshold: 20, recommendedThreshold: undefined, currency: "USD" },
    ],
    spend: [{ provider: "openai" as const, dailySpent: 0.98, monthlySpent: 12.4, openReservations: 2, lastBlockedAt: now, lastBlockReason: "daily_budget_exceeded" }],
    recentBlocks: [
      { provider: "openai" as const, operation: "draft_generation", createdAt: now, reason: "Bloqueado pelo circuit breaker de orçamento: daily_budget_exceeded" },
      { provider: "openai" as const, operation: "internal_audit", createdAt: soon, reason: "Bloqueado pelo circuit breaker de orçamento: daily_budget_exceeded" },
    ],
  },
  no_config: {
    available: true,
    modes: [
      { provider: "openai" as const, mode: "DISABLED" as const },
      { provider: "gnews" as const, mode: "DISABLED" as const },
      { provider: "replicate" as const, mode: "DISABLED" as const },
      { provider: "pexels" as const, mode: "DISABLED" as const },
      { provider: "supabase" as const, mode: "DISABLED" as const },
    ],
    thresholds: [],
    spend: [],
    recentBlocks: [],
  },
  no_reservations_no_blocks: {
    available: true,
    modes: [{ provider: "openai" as const, mode: "AUDIT" as const }],
    thresholds: [],
    spend: [{ provider: "openai" as const, dailySpent: 0, monthlySpent: 0, openReservations: 0, lastBlockedAt: undefined, lastBlockReason: undefined }],
    recentBlocks: [],
  },
  unavailable: {
    available: false,
    modes: [],
    thresholds: [],
    spend: [],
    recentBlocks: [],
  },
} as const;

export default async function BudgetPanelFixturesPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.PLAYWRIGHT_TEST_FIXTURES !== "1") notFound();
  const { scenario } = await searchParams;
  const data = SCENARIOS[(scenario as keyof typeof SCENARIOS) ?? "disabled"];
  if (!data) notFound();
  return (
    <main id="conteudo" style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto" }}>
      <h1>Fixture: {scenario ?? "disabled"}</h1>
      <BudgetPanel
        available={data.available}
        modes={[...data.modes]}
        thresholds={[...data.thresholds]}
        spend={[...data.spend]}
        recentBlocks={[...data.recentBlocks]}
      />
    </main>
  );
}
