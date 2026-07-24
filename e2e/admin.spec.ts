import path from "node:path";
import { config as loadEnv } from "dotenv";
import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 7 (Secao 25/42) — ADMIN_PASSWORD só existe em .env.production (não
// em .env.local — nunca foi configurada localmente neste projeto). Lido
// aqui via dotenv, do MESMO arquivo copiado para o worktree isolado que
// serve o build sob teste (garantido idêntico pela técnica de build
// isolado documentada no deploy runbook).
loadEnv({ path: path.join(process.cwd(), ".env.production") });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;


test.describe("admin", () => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não disponível no ambiente de teste");

  async function login(page: import("@playwright/test").Page) {
    await page.goto(withBasePath("/admin/login"));
    await page.locator("#admin-password").fill(ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /Acessar painel/i }).click();
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10_000 });
  }

  test("login com senha errada mostra erro, não redireciona", async ({ page }) => {
    await page.goto(withBasePath("/admin/login"));
    await page.locator("#admin-password").fill("senha-obviamente-errada-e2e");
    await page.getByRole("button", { name: /Acessar painel/i }).click();
    // getByRole("alert") tambem casa com o __next-route-announcer__ (Next.js injeta
    // automaticamente); getByText e especifico o suficiente aqui.
    await expect(page.getByText("Senha invalida.")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("login válido acessa o dashboard; rota protegida sem cookie redireciona para /admin/login", async ({ page, context }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/admin\/login/);

    await context.clearCookies();
    await page.goto(withBasePath("/admin/agente"));
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("Operação do Agente: carrega, mostra cron/próxima execução, sem overflow", async ({ page }) => {
    await login(page);
    await page.goto(withBasePath("/admin/agente"));
    await expect(page.getByRole("heading", { name: /Agente Autônomo/i })).toBeVisible();
    await expect(page.getByText(/05:00 e 17:00/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("Custos e APIs: carrega, mostra rótulos honestos quando telemetria indisponível/dados ausentes", async ({ page }) => {
    await login(page);
    await page.goto(withBasePath("/admin/custos"));
    await expect(page.getByRole("heading", { name: /Custos e APIs/i })).toBeVisible();
    // Nunca "R$ 0,00" ou "US$ 0" disfarçando dado ausente — sempre "—" ou texto explícito.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/R\$\s*0,00/);
  });

  // Fase 9B.0 (fechamento) — BudgetPanel contra o Supabase REAL de
  // produção (migration desta fase não aplicada, proibido nesta etapa):
  // deve degradar graciosamente para "ainda não disponível", nunca crash,
  // nunca expor secret. Os demais estados (DISABLED/AUDIT/ENFORCE) usam
  // fixtures em budget-panel-fixtures.spec.ts, já que o Supabase real não
  // pode produzi-los sem a migration.
  test("Custos e APIs: BudgetPanel degrada graciosamente quando budget_* não existe (migration não aplicada)", async ({ page }) => {
    await login(page);
    await page.goto(withBasePath("/admin/custos"));
    await expect(page.getByRole("heading", { name: /Controle de orçamento/i })).toBeVisible();
    await expect(page.getByText(/ainda não estão disponíveis neste ambiente/)).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(bodyText).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  });

  test("Custos e APIs: usuário não autenticado é redirecionado para /admin/login", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(withBasePath("/admin/custos"));
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("SEO e Medição: carrega, mostra Meta Pixel configurado e Google como pendente", async ({ page }) => {
    await login(page);
    await page.goto(withBasePath("/admin/seo"));
    // getByLabel(/Meta Pixel/i) tambem casa com o checkbox "Meta Pixel gerenciado
    // dentro do GTM" — exact:true restringe ao campo de texto do ID.
    await expect(page.getByLabel("Meta Pixel", { exact: true })).toBeVisible();
  });
});
