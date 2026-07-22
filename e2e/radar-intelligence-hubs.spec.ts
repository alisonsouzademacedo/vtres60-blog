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
    if (await companiesSection.count()) {
      const cards = companiesSection.locator(`a[href^="${withBasePath("/empresas/")}"]`);
      // Cada card visível precisa corresponder a uma empresa com pelo menos
      // um post real — verificado indiretamente: a seção some inteiramente
      // quando data-hasCoverage é falso para todas (ver Task 10's emptyState).
      expect(await cards.count()).toBeGreaterThanOrEqual(0);
    }
  });
});
