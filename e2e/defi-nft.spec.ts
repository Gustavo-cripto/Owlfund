import { test, expect } from "@playwright/test";

// Ao ligar um endereço, os NFTs e as posições DeFi aparecem? (dono, 21 out 2026)
// Conta descartável (como e2e/conta-nova.spec.ts), um endereço público com
// posições Uniswap e NFTs (a "Carteira Block" do exemplo: vitalik.eth) e, na
// Solana, um endereço com NFTs. Verifica a linha "DeFi:" com valor, as
// "Posições DeFi" e a linha "NFT:" com itens. Apaga a conta no fim.

const ETH = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test("ligar um endereço mostra DeFi, posições e NFTs", async ({ page }) => {
  const email = `suporte.chainfolioai+e2e-defi-${Date.now()}@gmail.com`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  let criada = false;
  try {
    await page.goto("/login?mode=signup");
    await page.locator("#lg-email").fill(email);
    await page.locator("#lg-password").fill(password);
    await page.locator("#lg-confirm").fill(password);
    await page.getByRole("button", { name: /^Criar conta$/ }).first().click();
    await page.waitForURL(/\/wallets/, { timeout: 30_000 });
    criada = true;

    // Tira o exemplo e cola o endereço real pelo campo rápido.
    await page.getByRole("button", { name: /^✕ Remover exemplo$/ }).click();
    await page.waitForURL(/\/wallets/);
    await expect(page.locator("#wl-quick")).toBeVisible({ timeout: 30_000 });
    await page.locator("#wl-quick").fill(ETH);
    await page.locator("form:has(#wl-quick)").getByRole("button", { name: /^Adicionar$/ }).click();
    await expect(page.getByText(/Carteiras:\s*1\/3/)).toBeVisible({ timeout: 15_000 });

    // A linha da carteira na lista Ethereum: DeFi com valor (não "—" nem erro) e NFT com itens.
    const linha = page.locator("div", { has: page.getByText(/0xd8dA…6045|0xd8dA6BF2/i) }).filter({ hasText: /DeFi:/ }).first();
    await expect(linha).toBeVisible({ timeout: 30_000 });
    await expect(linha.getByText(/Erro ao carregar DeFi/)).toHaveCount(0);
    await expect(linha).toHaveText(/DeFi:\s*(€|\$)?\s*[\d.,]+/, { timeout: 90_000 });
    await expect(linha.getByText(/Posições DeFi/)).toBeVisible({ timeout: 30_000 });
    await expect(linha.getByText(/Erro ao carregar NFTs/)).toHaveCount(0);
    await expect(linha).toHaveText(/NFT:\s*\d+\s*(item|itens)/, { timeout: 90_000 });
  } finally {
    const r = await page.request.post("/api/account/delete").catch(() => null);
    if (criada) expect(r?.ok(), `Não foi possível apagar a conta de teste ${email} (${r?.status()})`).toBeTruthy();
  }
});
