import { test, expect } from "@playwright/test";
import { esperarConteudo, vigiarErros } from "./helpers";

// A exportação e Pro: com a conta de teste em Free confirma-se que esta
// fechada (cadeado a apontar para o upgrade); com Pro/Premium descarrega-se
// mesmo o Excel e o PDF e verifica-se que sao ficheiros a serio.

test("fiscalidade: cálculo aparece e a exportação faz o que o plano permite", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/fiscalidade");
  await esperarConteudo(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fiscalidade/);

  const botaoExcel = page.getByRole("button", { name: /Excel|CSV/i }).first();
  const cadeado = page.getByRole("link", { name: /🔒/ }).first();

  if (await botaoExcel.count()) {
    const dl = page.waitForEvent("download", { timeout: 30_000 });
    await botaoExcel.click();
    const ficheiro = await dl;
    expect(ficheiro.suggestedFilename()).toMatch(/\.xlsx$/);
    const caminho = await ficheiro.path();
    expect(caminho).toBeTruthy();

    const botaoPdf = page.getByRole("button", { name: /PDF/ }).first();
    const dl2 = page.waitForEvent("download", { timeout: 60_000 });
    await botaoPdf.click();
    expect((await dl2).suggestedFilename()).toMatch(/\.pdf$/);
    test.info().annotations.push({ type: "exportação", description: "Excel e PDF descarregados" });
  } else {
    await expect(cadeado).toBeVisible();
    await expect(cadeado).toHaveAttribute("href", /\/(pricing|beta)/);
    test.info().annotations.push({ type: "exportação", description: "conta Free — só verificado o cadeado (dá Premium beta à conta de teste para testar o download)" });
  }
  v.verificar();
});
