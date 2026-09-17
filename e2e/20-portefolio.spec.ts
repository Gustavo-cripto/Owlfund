import { test, expect } from "@playwright/test";
import { esperarConteudo, vigiarErros } from "./helpers";

test("portefólio: gráfico, tabs e ver em grande", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/portfolio");
  await esperarConteudo(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Secção do gráfico com os tabs; o sublinhado segue o tab escolhido.
  const tabs = page.getByRole("button", { name: /^(Tokens|NFTs|DeFi)/ });
  await expect(tabs.first()).toBeVisible();
  await page.getByRole("button", { name: /^NFTs/ }).click();
  await page.getByRole("button", { name: /^Tokens/ }).click();

  // Um gráfico "ver em grande" abre um diálogo e fecha com Esc.
  const abrir = page.getByRole("button", { name: /Ver em grande/ }).first();
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogo).toHaveCount(0);

  // Os preços chegaram (o total nunca fica "a carregar" nem vazio).
  const precos = await page.request.get("/api/prices");
  expect(precos.ok(), "/api/prices").toBeTruthy();
  v.verificar();
});
