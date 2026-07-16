import { defineConfig, devices } from "@playwright/test";

// Fase 7 (Secao 25/32) — roda SEMPRE contra um servidor iniciado num build
// isolado (git worktree em porta diferente, ver docs/deploy). NUNCA contra
// o processo PM2 vtres60-blog real — evitar isso é o motivo de existir
// PLAYWRIGHT_BASE_URL em vez de um baseURL fixo em :3002.
// Nota: baseURL fica so na ORIGEM (sem /blog) de proposito — a resolucao de
// URL do Playwright trata um path com "/" inicial como relativo a ORIGEM,
// nunca ao path do baseURL (mesmo comportamento de new URL()). Se baseURL
// incluisse "/blog", qualquer page.goto("/algo") ignoraria silenciosamente
// o prefixo. Cada spec usa o helper BASE_PATH (e2e/base-path.ts) para
// prefixar as rotas explicitamente, do mesmo jeito que src/lib/paths.ts
// faz na aplicacao real.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3999";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    // admin/axe/consent-and-pixel: comportamento de rede/auth/acessibilidade
    // estrutural nao depende do viewport — rodam so no project desktop-1440
    // (testIgnore nos outros 3, em vez de test.skip() em runtime dentro de
    // cada spec, que exige callback de fixture nao suportado no escopo do
    // arquivo pela API do Playwright).
    {
      name: "mobile-375",
      testIgnore: ["**/admin.spec.ts", "**/axe.spec.ts", "**/consent-and-pixel.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "tablet-portrait-768",
      testIgnore: ["**/admin.spec.ts", "**/axe.spec.ts", "**/consent-and-pixel.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "tablet-landscape-1024",
      testIgnore: ["**/admin.spec.ts", "**/axe.spec.ts", "**/consent-and-pixel.spec.ts"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
