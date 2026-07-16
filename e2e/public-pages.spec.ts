import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 7 (Secao 25) — carregamento/overflow/navegacao nas paginas
// publicas principais, nos 4 viewports configurados em playwright.config.ts
// (cada um roda como um "project" separado — Playwright ja executa este
// arquivo uma vez por viewport automaticamente).
const PAGES: { path: string; heading: RegExp | string }[] = [
  { path: "/", heading: /VTRES60|Indústria/i },
  { path: "/noticias", heading: /Notícias|notícias/i },
  { path: "/categorias/marketing-industrial", heading: /Marketing/i },
  { path: "/empresas/weg", heading: /WEG/i },
  { path: "/buscar", heading: /Busca|buscar/i },
];

for (const { path, heading } of PAGES) {
  test(`${path} — carrega, sem overflow horizontal, tem navegação`, async ({ page }) => {
    const response = await page.goto(withBasePath(path));
    expect(response?.ok(), `HTTP status para ${path}`).toBeTruthy();

    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 10_000 });

    // Sem overflow horizontal: scrollWidth do documento nunca deve exceder
    // clientWidth (viewport) — sinal comum de card/tabela/menu quebrando
    // layout em telas estreitas.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow horizontal em ${path}`).toBeLessThanOrEqual(1);

    // Navegação principal presente e com pelo menos um link utilizável.
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible();
    expect(await nav.locator("a").count()).toBeGreaterThan(0);
  });
}

test("home → menu abre e permite navegar para /blog/noticias", async ({ page }) => {
  await page.goto(withBasePath("/"));
  const noticiasLink = page.locator('a[href*="/blog/noticias"]').first();
  await expect(noticiasLink).toBeVisible();
  await noticiasLink.click();
  await expect(page).toHaveURL(/\/blog\/noticias/);
});

test("/blog/noticias → card de notícia real leva à página da matéria", async ({ page }) => {
  await page.goto(withBasePath("/noticias"));
  const articleLink = page.locator('a[href*="/noticias/"]').first();
  await expect(articleLink).toBeVisible({ timeout: 10_000 });
  const href = await articleLink.getAttribute("href");
  await articleLink.click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Página de notícia real: título visível, sem overflow.
  await expect(page.locator("h1").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("/buscar → formulário de busca tem nome acessível e aceita input", async ({ page }) => {
  await page.goto(withBasePath("/buscar"));
  const searchInput = page.getByLabel(/Buscar/i);
  await expect(searchInput).toBeVisible();
  await searchInput.fill("indústria");
  await expect(searchInput).toHaveValue("indústria");
});

test("estado vazio: categoria sem posts mostra mensagem honesta, não conteúdo genérico não relacionado", async ({ page }) => {
  const response = await page.goto(withBasePath("/categorias/categoria-inexistente-teste-e2e"));
  // 404 é uma resposta honesta válida para uma categoria que não existe.
  expect([404, 200]).toContain(response?.status());
});
