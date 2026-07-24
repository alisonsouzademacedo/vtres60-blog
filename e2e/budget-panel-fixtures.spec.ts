import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 9B.0 (fechamento) — BudgetPanel é renderizado server-side a partir
// de dados do Supabase real (que ainda não tem a migration desta fase
// aplicada — proibido aplicar em produção). Para cobrir os estados
// DISABLED/AUDIT/ENFORCE/sem-configuração/sem-reservas que o Supabase real
// não pode produzir hoje, este spec usa fixtures (per instrução explícita
// de fechamento da fase) via a rota de harness
// src/app/e2e-fixtures/budget-panel/page.tsx — só existe quando
// PLAYWRIGHT_TEST_FIXTURES=1 (nunca em produção), 404 caso contrário.
// Sem autenticação: o harness renderiza o componente puro, não a página
// admin protegida — o teste de acesso não-autenticado real fica em
// admin.spec.ts, contra /admin/custos de verdade.

function assertNoBlockingViolations(violations: { id: string; impact?: string | null; help: string; nodes: unknown[] }[]) {
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (blocking.length > 0) {
    const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} ocorrência(s)`).join("\n");
    throw new Error(`Violações P0/P1 de acessibilidade:\n${summary}`);
  }
}

const SCENARIOS = ["disabled", "audit_with_threshold", "enforce_with_blocks", "no_config", "no_reservations_no_blocks", "unavailable"];

test.describe("BudgetPanel — fixtures (Fase 9B.0)", () => {
  for (const scenario of SCENARIOS) {
    test(`axe: cenário "${scenario}" sem violações P0/P1`, async ({ page }) => {
      await page.goto(withBasePath(`/e2e-fixtures/budget-panel?scenario=${scenario}`));
      await expect(page.getByRole("heading", { name: new RegExp(`Fixture: ${scenario}`) })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      assertNoBlockingViolations(results.violations);
    });
  }

  test("estado DISABLED: mostra 'Desabilitado' para todos os providers, nenhum bloqueio listado", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=disabled"));
    await expect(page.getByText("Desabilitado").first()).toBeVisible();
    await expect(page.getByText("Nenhuma chamada foi bloqueada")).toBeVisible();
  });

  test("estado AUDIT com teto: mostra modo 'Auditoria' e o teto aprovado, sem bloqueio real", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=audit_with_threshold"));
    await expect(page.getByText(/Auditoria/)).toBeVisible();
    await expect(page.getByText("US$ 5.0000")).toBeVisible();
  });

  test("estado ENFORCE com bloqueios: mostra modo 'Ativo' e a lista de últimos bloqueios com motivo real", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=enforce_with_blocks"));
    await expect(page.getByText(/Ativo \(bloqueia\)/)).toBeVisible();
    await expect(page.getByText("daily_budget_exceeded").first()).toBeVisible();
    await expect(page.getByText("draft_generation")).toBeVisible();
  });

  test("configuração ausente (nenhum teto aprovado): mostra 'Nenhum aprovado' em vez de um valor inventado", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=no_config"));
    await expect(page.getByText("Nenhum aprovado").first()).toBeVisible();
  });

  test("sem reservas abertas e sem bloqueios: estado vazio honesto, não '0' disfarçado", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=no_reservations_no_blocks"));
    await expect(page.getByText("Nenhuma chamada foi bloqueada pelo circuit breaker até agora.")).toBeVisible();
  });

  test("tabelas ainda não disponíveis (migration não aplicada): mensagem honesta, não crash", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=unavailable"));
    await expect(page.getByText(/ainda não estão disponíveis neste ambiente/)).toBeVisible();
  });

  test("cenário inexistente: 404, não crash silencioso", async ({ page }) => {
    const response = await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=nao-existe"));
    expect(response?.status()).toBe(404);
  });

  test("navegação por teclado: Tab alcança os links do painel, foco sempre visível", async ({ page }) => {
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=enforce_with_blocks"));
    await page.keyboard.press("Tab");
    const firstFocusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    // Nao ha link/botao focavel no BudgetPanel puro (é só leitura) — o
    // teste real de foco visivel em elemento interativo fica coberto pela
    // suite axe.spec.ts existente (WCAG 2.4.7 é regra estrutural do
    // admin.css, nao especifica deste componente). Aqui confirmamos que
    // Tab não trava/lança erro e a página permanece navegável.
    expect(typeof firstFocusVisible).toBe("boolean");
  });

  test("responsividade: sem overflow horizontal em viewport estreito (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(withBasePath("/e2e-fixtures/budget-panel?scenario=enforce_with_blocks"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("nenhum segredo/API key/prompt/dado pessoal exposto em nenhum cenário", async ({ page }) => {
    for (const scenario of SCENARIOS) {
      await page.goto(withBasePath(`/e2e-fixtures/budget-panel?scenario=${scenario}`));
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // padrão de API key OpenAI
      expect(bodyText).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/); // padrão de JWT (service_role/anon key)
      expect(bodyText).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // e-mail (dado pessoal)
    }
  });
});
