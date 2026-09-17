import { test, expect } from "@playwright/test";
import { esperarConteudo, vigiarErros } from "./helpers";

test("carteiras: página abre e um endereço inválido dá erro claro, não técnico", async ({ page }) => {
  const v = vigiarErros(page);
  await page.goto("/wallets");
  await esperarConteudo(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Primeiro campo de endereço da página (ETH): escrever lixo tem de dar uma
  // mensagem para pessoas (ErrorNote), nunca um "TypeError"/"fetch".
  const campo = page.getByPlaceholder(/0x|endereço|address/i).first();
  if (await campo.count()) {
    await campo.fill("isto-nao-e-um-endereco");
    await campo.press("Enter");
    const alerta = page.getByRole("alert").first();
    await expect(alerta).toBeVisible({ timeout: 10_000 });
    await expect(alerta).not.toContainText(/fetch|TypeError|undefined/i);
  } else {
    test.info().annotations.push({ type: "nota", description: "sem campo de endereço visível (limite do plano?) — só verificado que a página abre" });
  }
  v.verificar();
});
