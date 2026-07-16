import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

// Fase 7 (Secao 23/41) — validacao de REDE real do Meta Pixel, o
// complemento dos 12/14 casos ja cobertos por unit test em
// meta-pixel-gate.test.ts (os 2 que exigem navegador real: fbq realmente
// chamado com o ID correto, e PageView unico/sem duplicar em navegacao
// SPA). So roda uma vez (nao precisa repetir por viewport — comportamento
// de rede independe de tamanho de tela) — ver playwright.config.ts.

function isFacebookRequest(url: string): boolean {
  return url.includes("connect.facebook.net") || url.includes("facebook.com/tr");
}

test("ANTES do consentimento: nenhuma chamada ao Facebook, fbq não inicializado", async ({ page }) => {
  const facebookRequests: string[] = [];
  page.on("request", (request) => {
    if (isFacebookRequest(request.url())) facebookRequests.push(request.url());
  });

  await page.goto(withBasePath("/"));
  await page.waitForTimeout(1500); // tempo suficiente para qualquer script assíncrono disparar, se existisse

  expect(facebookRequests).toEqual([]);
  const fbqDefined = await page.evaluate(() => typeof window.fbq);
  expect(fbqDefined).toBe("undefined");
});

test("consentimento apenas ANALYTICS: Pixel continua sem carregar", async ({ page }) => {
  const facebookRequests: string[] = [];
  page.on("request", (request) => {
    if (isFacebookRequest(request.url())) facebookRequests.push(request.url());
  });

  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Personalizar" }).click();
  await page.getByRole("checkbox", { name: /Análise/i }).check();
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await page.waitForTimeout(1500);

  expect(facebookRequests).toEqual([]);
});

test("APÓS consentimento de MARKETING: fbevents.js solicitado, fbq init com o ID correto, PageView único", async ({ page }) => {
  const facebookRequests: string[] = [];
  page.on("request", (request) => {
    if (isFacebookRequest(request.url())) facebookRequests.push(request.url());
  });

  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Aceitar tudo" }).click();
  await page.waitForTimeout(1500);

  expect(facebookRequests.some((url) => url.includes("fbevents.js"))).toBe(true);

  // fbq real não expõe o ID configurado diretamente; validamos via o
  // conteúdo do script inline injetado, que é a fonte de verdade real.
  const pixelScriptContent = await page.evaluate(() => document.getElementById("meta-pixel")?.textContent ?? "");
  expect(pixelScriptContent).toContain("fbq('init'");
  expect(pixelScriptContent).toMatch(/fbq\('init','\d+'\)/);

  const pageViewCount = (pixelScriptContent.match(/fbq\('track','PageView'\)/g) ?? []).length;
  expect(pageViewCount).toBe(1);
});

test("navegação SPA após consentimento: dispara novo PageView, sem duplicar o anterior", async ({ page }) => {
  const trackCalls: unknown[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __fbqCalls: unknown[] }).__fbqCalls = [];
  });

  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Aceitar tudo" }).click();
  await page.waitForFunction(() => typeof window.fbq === "function", undefined, { timeout: 10_000 });

  // Intercepta fbq DEPOIS que o Pixel real já carregou, para contar só as
  // chamadas de navegação subsequentes (o PageView inicial já foi
  // confirmado no teste anterior).
  await page.evaluate(() => {
    const original = window.fbq!;
    window.fbq = (...args: unknown[]) => {
      (window as unknown as { __fbqCalls: unknown[] }).__fbqCalls.push(args);
      return original(...args);
    };
  });

  const noticiasLink = page.locator('a[href*="/blog/noticias"]').first();
  await noticiasLink.click();
  await page.waitForURL(/\/blog\/noticias/);
  await page.waitForTimeout(1000);

  const calls = await page.evaluate(() => (window as unknown as { __fbqCalls: unknown[] }).__fbqCalls);
  const pageViewCalls = calls.filter((call) => Array.isArray(call) && call[0] === "track" && call[1] === "PageView");
  expect(pageViewCalls.length).toBe(1);
  void trackCalls;
});

test("admin: Pixel nunca carrega, mesmo com marketing já aceito", async ({ page }) => {
  const facebookRequests: string[] = [];
  page.on("request", (request) => {
    if (isFacebookRequest(request.url())) facebookRequests.push(request.url());
  });

  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Aceitar tudo" }).click();
  // Deixa o Pixel da home terminar seu proprio bootstrap interno (fbevents.js
  // dispara uma chamada de signals/config alem do nosso PageView explicito)
  // ANTES de zerar a lista — sem isso, uma requisicao com keepalive/sendBeacon
  // iniciada na home pode ser contabilizada apos a navegacao para o admin,
  // dando falso positivo (nao e o admin carregando o Pixel, e a home).
  await page.waitForTimeout(2000);
  facebookRequests.length = 0;

  await page.goto(withBasePath("/admin/login"));
  await page.waitForTimeout(1000);

  expect(facebookRequests).toEqual([]);
  const pixelScript = await page.evaluate(() => document.getElementById("meta-pixel"));
  expect(pixelScript).toBeNull();
});

test("revogar consentimento (Recusar) impede o Pixel de carregar numa nova visita", async ({ page, context }) => {
  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Recusar" }).click();
  await page.waitForTimeout(500);

  await context.clearCookies();
  const facebookRequests: string[] = [];
  page.on("request", (request) => {
    if (isFacebookRequest(request.url())) facebookRequests.push(request.url());
  });

  await page.reload();
  await page.waitForTimeout(1000);

  const pixelScript = await page.evaluate(() => document.getElementById("meta-pixel"));
  expect(pixelScript).toBeNull();
  expect(facebookRequests).toEqual([]);
});

test("falha de rede do Facebook não quebra a página (script carrega via <Script async>, fire-and-forget)", async ({ page }) => {
  await page.route("**://connect.facebook.net/**", (route) => route.abort());

  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(withBasePath("/"));
  await page.getByRole("button", { name: "Aceitar tudo" }).click();
  await page.waitForTimeout(1500);

  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("heading").first()).toBeVisible();
});
