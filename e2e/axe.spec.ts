import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { config as loadEnv } from "dotenv";
import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 7 (Secao 26) — axe-core nas paginas principais. So roda uma vez
// (findings de acessibilidade estrutural nao mudam por causa do viewport
// de teste — o que muda com viewport e coberto pelos testes de overflow
// em public-pages.spec.ts).

loadEnv({ path: path.join(process.cwd(), ".env.production") });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// P0/P1 = corrigidos antes do deploy (Secao 26/48). Falhas 'critical'/'serious'
// bloqueiam o teste; 'moderate'/'minor' (P2) são reportadas no console e no
// checkpoint pré-deploy, não bloqueiam — não alegamos conformidade WCAG
// completa só porque o axe passou (Secao 26, último parágrafo).
function assertNoBlockingViolations(violations: { id: string; impact?: string | null; help: string; nodes: unknown[] }[]) {
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (blocking.length > 0) {
    const summary = blocking.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} ocorrência(s)`).join("\n");
    throw new Error(`Violações P0/P1 de acessibilidade:\n${summary}`);
  }
  const p2 = violations.filter((v) => v.impact === "moderate" || v.impact === "minor");
  if (p2.length > 0) {
    // eslint-disable-next-line no-console -- P2 documentado no console do test runner para o checkpoint pré-deploy (Secao 26/33), não falha o teste.
    console.log(`[axe P2, não bloqueante] ${p2.map((v) => `${v.id} (${v.impact})`).join(", ")}`);
  }
}

const PUBLIC_PAGES = ["/", "/noticias", "/categorias/marketing-industrial", "/empresas/weg", "/buscar"];

for (const path_ of PUBLIC_PAGES) {
  test(`axe: ${path_} sem violações P0/P1`, async ({ page }) => {
    await page.goto(withBasePath(path_));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    assertNoBlockingViolations(results.violations);
  });
}

test("axe: banner de consentimento sem violações P0/P1", async ({ page }) => {
  await page.goto(withBasePath("/"));
  await expect(page.getByRole("dialog", { name: /Preferências de cookies/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).include('[role="dialog"]').analyze();
  assertNoBlockingViolations(results.violations);
});

test.describe("axe: admin", () => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não disponível no ambiente de teste");

  test("axe: /admin/login sem violações P0/P1", async ({ page }) => {
    await page.goto(withBasePath("/admin/login"));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    assertNoBlockingViolations(results.violations);
  });

  test("axe: /admin/agente (autenticado) sem violações P0/P1", async ({ page }) => {
    await page.goto(withBasePath("/admin/login"));
    await page.locator("#admin-password").fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /Acessar painel/i }).click();
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10_000 });
    await page.goto(withBasePath("/admin/agente"));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    assertNoBlockingViolations(results.violations);
  });
});
