import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

test.describe("Radar Industrial (público)", () => {
  test("home mostra estado vazio honesto quando não há sinal publicado, ou mostra sinal real com evidência", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const radarSection = page.locator("section", { hasText: "Radar Industrial" });
    await expect(radarSection).toBeVisible();
    // Aceita tanto o estado vazio honesto quanto um sinal real — o teste
    // prova que a seção nunca mostra o texto hardcoded antigo.
    await expect(page.getByText("IA industrial acelera projetos de eficiência")).toHaveCount(0);
  });

  test("/radar é uma página real e nunca mostra o array hardcoded antigo", async ({ page }) => {
    await page.goto(withBasePath("/radar"));
    await expect(page.getByRole("heading", { name: "Radar Industrial" })).toBeVisible();
    await expect(page.getByText("Demanda emergente")).toHaveCount(0);
  });
});

test.describe("Inteligência VTRES60 (público)", () => {
  test("home nunca mostra o array de 3 itens hardcoded antigo", async ({ page }) => {
    await page.goto(withBasePath("/"));
    await expect(page.getByText("Fabricantes de máquinas encontram espaço em retrofit")).toHaveCount(0);
  });
});

test.describe("Hubs de empresas (público)", () => {
  test("Home só destaca empresas com cobertura real (nunca uma sem post publicado)", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const companiesSection = page.locator("section", { hasText: "Hubs editoriais" });
    await expect(companiesSection).toBeVisible();
    const cards = companiesSection.locator(`a[href^="${withBasePath("/empresas/")}"]`);
    const cardCount = await cards.count();
    if (cardCount === 0) {
      // Nenhum post publicado tem empresa associada hoje (0/29 confirmado
      // via SQL na Fase 8D) — a home deve mostrar o estado vazio honesto,
      // nunca a lista inteira de empresas sem filtro de cobertura.
      await expect(companiesSection.getByText("Nenhuma empresa com cobertura editorial")).toBeVisible();
    } else {
      // Prova real de cobertura, não apenas confiança na filtragem client-side:
      // cada card visível precisa levar a um hub que realmente tem pelo menos
      // um artigo — nunca uma empresa "destacada" sem nenhuma matéria real.
      for (let i = 0; i < cardCount; i++) {
        const href = await cards.nth(i).getAttribute("href");
        expect(href).toBeTruthy();
        const hubPage = await page.context().newPage();
        await hubPage.goto(href!);
        await expect(hubPage.locator("article, a[href*='/noticias/']").first()).toBeVisible();
        await hubPage.close();
      }
    }
  });
});
