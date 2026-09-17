import { test, expect } from "@playwright/test";
import { esperarConteudo, vigiarErros } from "./helpers";

// Escreve na conta de teste: garante que existe pelo menos uma transação
// (para a Fiscalidade ter o que calcular e exportar) e testa o formulário com
// vírgula decimal, que foi um defeito real no iPhone.

test("histórico: registar uma compra com vírgula decimal", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/historico");
  await esperarConteudo(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Histórico/);

  const antes = await page.locator("tbody tr").count();

  await page.locator("#hx-qty").fill("0,01");
  await page.locator("#hx-price").fill("50000");
  await page.getByRole("button", { name: /^Registar compra$/ }).click();

  // Toast de confirmação e mais uma linha na tabela.
  await expect(page.getByRole("status")).toContainText(/registada/i);
  await expect(page.locator("tbody tr")).toHaveCount(antes + 1);
  await expect(page.locator("tbody tr").first()).toContainText(/0[.,]01/);
  v.verificar();
});
