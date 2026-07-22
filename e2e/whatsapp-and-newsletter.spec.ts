import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 8B — CTA comercial via WhatsApp (home, seção "Análise VTRES60") e
// captação de leads com copy honesta. Roda contra o build isolado do
// worktree (ver playwright.config.ts), nunca contra o PM2 ao vivo.

test("home → CTA 'Falar com um especialista' abre WhatsApp em nova aba, sem app obrigatório", async ({ page }) => {
  await page.goto(withBasePath("/"));
  const cta = page.getByRole("link", { name: /Falar com um especialista/i });
  await expect(cta).toBeVisible();
  const href = await cta.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/555596634475/);
  expect(href).not.toContain("wa.me/5555596634475"); // sem dígito extra
  await expect(cta).toHaveAttribute("target", "_blank");
  const rel = await cta.getAttribute("rel");
  expect(rel).toContain("noopener");
});

test("home → CTA do WhatsApp não dispara nenhuma requisição de rede ao ser renderizado (mensagem não é enviada automaticamente)", async ({
  page,
}) => {
  const waRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("wa.me") || request.url().includes("whatsapp")) waRequests.push(request.url());
  });
  await page.goto(withBasePath("/"));
  await page.waitForLoadState("networkidle");
  expect(waRequests).toHaveLength(0);
});

test("home → newsletter não promete envio diário/ativo ainda inexistente", async ({ page }) => {
  await page.goto(withBasePath("/"));
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/briefing di[aá]rio/i);
  expect(bodyText).not.toMatch(/de segunda a sexta/i);
  expect(bodyText).not.toMatch(/receba todos os dias/i);
});

test("home → checkbox de consentimento da newsletter referencia a Política de Privacidade", async ({ page }) => {
  await page.goto(withBasePath("/"));
  const newsletterSection = page.locator("#newsletter");
  await expect(newsletterSection).toBeVisible();
  const privacyLink = newsletterSection.getByRole("link", { name: /Pol[ií]tica de Privacidade/i });
  await expect(privacyLink).toBeVisible();
  await expect(privacyLink).toHaveAttribute("href", /\/privacidade/);
});

test("/segmentos/[slug] → segmento sem posts reais mostra estado vazio honesto, não conteúdo genérico", async ({ page }) => {
  const response = await page.goto(withBasePath("/segmentos/metalurgia"));
  expect(response?.ok()).toBeTruthy();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toMatch(/Ainda não há conteúdos publicados aqui/i);
});
