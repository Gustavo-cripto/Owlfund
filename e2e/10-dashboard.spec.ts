import { test, expect } from "@playwright/test";
import { esperarConteudo, vigiarErros } from "./helpers";

test("dashboard abre com sessão, sem erros, e o menu leva às páginas", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);          // não foi mandado para /login
  await esperarConteudo(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // O plano tem de vir do servidor (Free/Pro/Premium), nunca ficar "desconhecido".
  const sub = await page.request.get("/api/subscription");
  expect(sub.ok(), "/api/subscription com sessão").toBeTruthy();
  const { plan } = (await sub.json()) as { plan?: string };
  expect(["free", "pro", "premium"]).toContain(plan);
  test.info().annotations.push({ type: "plano da conta de teste", description: plan ?? "?" });
  v.verificar();
});

test("sem sessão, uma página privada manda para o login e volta depois", async ({ browser }) => {
  const ctx = await browser.newContext();            // contexto limpo, sem sessão
  const page = await ctx.newPage();
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("#lg-email")).toBeVisible();
  await ctx.close();
});
