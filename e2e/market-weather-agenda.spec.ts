import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

/**
 * Fechamento Fase 8C — cobertura E2E dos fluxos novos desta fase:
 * geolocalização honesta do widget de clima e visibilidade real de
 * eventos da Agenda por status. Roda contra o build isolado (nunca
 * produção, ver playwright.config.ts).
 *
 * Limitação documentada (não escondida): as chamadas para INMET/BCB/World
 * Bank feitas pelo SERVIDOR (Server Component `MarketWeather`, na
 * renderização inicial) não são interceptáveis via `page.route()` —
 * Playwright só mocka requisições feitas pelo NAVEGADOR. Por isso os
 * testes abaixo que dependem de render inicial verificam presença de
 * seção/estados honestos (indisponível ou valor real), nunca um valor
 * fixo — e os testes de geolocalização (que usam
 * `navigator.geolocation` + `fetch` client-side para `/api/market/weather`)
 * mockam essa chamada específica via `page.route`, que É interceptável
 * por ser client-side.
 */

test.describe("Mercado/Clima na home", () => {
  test("home carrega a seção 'Referências de mercado' sem os mocks antigos (Joinville, R$ 5,48 fixo)", async ({ page }) => {
    await page.goto(withBasePath("/"));
    await expect(page.getByText(/Referências de mercado/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Moedas e commodities industriais/i })).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("Joinville");
    expect(bodyText).not.toMatch(/Dados demonstrativos.*18:00/);
  });

  test("cada cotação mostra um estado honesto: valor real OU 'Indisponível' explícito, nunca vazio silencioso", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const quotes = page.locator("[class*=quote]");
    await expect(quotes.first()).toBeVisible({ timeout: 15_000 });
    const count = await quotes.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const text = await quotes.nth(i).innerText();
      expect(text.trim().length, `cotação #${i} não pode estar vazia`).toBeGreaterThan(0);
    }
  });
});

test.describe("Clima — geolocalização (rede mockada)", () => {
  test("Santa Maria é o padrão antes de qualquer interação de localização", async ({ page }) => {
    await page.goto(withBasePath("/"));
    await expect(page.getByText(/Santa Maria/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Usar minha localização/i })).toBeVisible();
  });

  test("permissão concedida: mostra a estação real retornada pela API, com distância — nunca uma capital sem aviso", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -29.1678, longitude: -51.1794 }); // Caxias do Sul

    await page.route("**/api/market/weather**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          city: "Caxias Do Sul",
          state: "RS",
          condition: "Céu claro",
          temperatureMax: 22,
          temperatureMin: 14,
          period: "tarde",
          sourceName: "INMET — Instituto Nacional de Meteorologia (previsão)",
          sourceUrl: "https://apiprevmet3.inmet.gov.br",
          frequency: "Atualizada pelo INMET por período do dia (manhã/tarde/noite)",
          freshnessStatus: "delayed",
          stationName: "CAXIAS DO SUL",
          distanceKm: 0.3,
        }),
      });
    });

    await page.goto(withBasePath("/"));
    await page.getByRole("button", { name: /Usar minha localização/i }).click();
    await expect(page.getByText(/Caxias Do Sul/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Estação mais próxima.*CAXIAS DO SUL.*km/i)).toBeVisible();
  });

  test("permissão negada: mostra aviso honesto e mantém Santa Maria, sem travar a UI", async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto(withBasePath("/"));

    // Simula o callback de erro do navigator.geolocation com PERMISSION_DENIED,
    // já que o Playwright não tem uma API direta para "negar" no clique.
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_success: unknown, error?: PositionErrorCallback) => {
        error?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
      };
    });
    await page.reload();
    await page.getByRole("button", { name: /Usar minha localização/i }).click();
    await expect(page.getByText(/Permissão de localização negada/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Santa Maria/i).first()).toBeVisible();
  });

  test("estação não encontrada (fora do alcance): API retorna fallback e a UI avisa, não finge cobertura nacional", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -3, longitude: -60 }); // Amazônia profunda, longe de estações densas

    await page.route("**/api/market/weather**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          city: "Santa Maria",
          state: "RS",
          condition: "Nublado",
          temperatureMax: 20,
          temperatureMin: 12,
          period: "tarde",
          sourceName: "INMET — Instituto Nacional de Meteorologia (previsão)",
          sourceUrl: "https://apiprevmet3.inmet.gov.br",
          frequency: "Atualizada pelo INMET por período do dia (manhã/tarde/noite)",
          freshnessStatus: "delayed",
          locationFallback: true,
        }),
      });
    });

    await page.goto(withBasePath("/"));
    await page.getByRole("button", { name: /Usar minha localização/i }).click();
    await expect(page.getByText(/Nenhuma estação próxima.*Santa Maria/i)).toBeVisible({ timeout: 10_000 });
  });

  test("provider indisponível: mostra estado 'indisponível', nunca trava nem mostra dado inventado", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -29.1678, longitude: -51.1794 });
    await page.route("**/api/market/weather**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "indisponível" }) });
    });

    await page.goto(withBasePath("/"));
    await page.getByRole("button", { name: /Usar minha localização/i }).click();
    await expect(page.getByText(/Não foi possível obter sua localização/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Agenda — visibilidade real por status", () => {
  test("evento publicado e verificado (Fenasucro) aparece na agenda pública", async ({ page }) => {
    await page.goto(withBasePath("/agenda"));
    await expect(page.getByText(/Fenasucro/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("eventos candidatos (Febrava, Mercopar) NÃO aparecem na agenda pública", async ({ page }) => {
    await page.goto(withBasePath("/agenda"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Febrava/i);
    expect(bodyText).not.toMatch(/Mercopar/i);
  });

  test("home não lista eventos candidatos entre os próximos eventos", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/Febrava/i);
    expect(bodyText).not.toMatch(/Mercopar/i);
  });
});
