import { test, expect } from "@playwright/test";
import { vigiarErros } from "./helpers";

// Paginas publicas: abrem, sem erros de JS, e as interacoes principais funcionam.
// (A verificacao de todas as paginas/links/APIs e do scripts/verificar-site.mjs;
// aqui e o que so um browser a serio consegue confirmar.)

test("landing abre sem erros e o CTA leva ao registo", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".animate-ticker")).toBeVisible();
  await page.getByRole("link", { name: /Começar grátis/ }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("#lg-email")).toBeVisible();
  v.verificar();
});

test("como funciona: a captura abre em grande e fecha com Esc", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/como-funciona");
  const abrir = page.getByRole("button", { name: /Ver em grande/ }).first();
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);
  v.verificar();
});

test("login: credenciais erradas dão mensagem clara, não um erro técnico", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/login");
  await page.locator("#lg-email").fill("ninguem@example.com");
  await page.locator("#lg-password").fill("palavra-passe-errada");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  const alerta = page.getByRole("alert");
  await expect(alerta).toBeVisible();
  await expect(alerta).not.toContainText(/fetch|undefined|Error:/i);
  v.verificar();
});

test("páginas traduzidas abrem na língua certa", async ({ page }) => {
  for (const [path, lang] of [["/en", "en"], ["/es", "es"], ["/fr", "fr"]] as const) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${lang}`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
