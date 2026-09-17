import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Faz login uma vez com a conta de teste e guarda a sessao (cookies +
// localStorage) para os testes privados. A conta nao pode ter 2FA ativo.

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

setup("sessão com a conta de teste", async ({ page }) => {
  expect(EMAIL, "E2E_EMAIL em falta").not.toBe("");
  expect(PASSWORD, "E2E_PASSWORD em falta").not.toBe("");

  await page.goto("/login");
  await page.locator("#lg-email").fill(EMAIL);
  await page.locator("#lg-password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  // O login redireciona para o dashboard; um erro fica no <p role="alert">.
  await Promise.race([
    page.waitForURL(/\/dashboard/, { timeout: 30_000 }),
    page.getByRole("alert").waitFor({ timeout: 30_000 }).then(async () => {
      throw new Error(`Login falhou: ${await page.getByRole("alert").innerText()}`);
    }),
  ]);
  await expect(page).toHaveURL(/\/dashboard/);

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
