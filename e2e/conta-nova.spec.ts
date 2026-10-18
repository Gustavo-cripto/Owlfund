import { test, expect } from "@playwright/test";

// O percurso de quem chega e cria conta, de ponta a ponta, todas as noites,
// com uma conta DESCARTÁVEL que se apaga no fim (16 out 2026).
//
// Porquê: numa semana passaram três falhas por este caminho sem ninguém dar
// por elas, porque os testes só usavam uma conta antiga:
//   1. o registo mostrava "verifica o teu email" (a confirmação está
//      desligada no Supabase) em vez de entrar;
//   2. com o exemplo carregado, as 3 carteiras de exemplo enchiam o limite do
//      Free e escondiam o campo "cola o teu endereço";
//   3. o DeFi do exemplo ficava a contar como da pessoa.
//
// A conta é suporte.chainfolioai+e2e-<hora>@gmail.com: conta como interna
// (CONTAS_INTERNAS aceita aliases) e não recebe boas-vindas (+e2e). O browser
// identifica-se como Playwright, por isso as visitas e os eventos contam como
// robô. A conta apaga-se pela própria rota do cliente (/api/account/delete),
// mesmo que o teste falhe a meio.

const ENDERECO_TESTE = "0x1111111111111111111111111111111111111111";

test("conta nova: regista, entra, vê o exemplo e liga uma carteira", async ({ page }) => {
  const email = `suporte.chainfolioai+e2e-${Date.now()}@gmail.com`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  let criada = false;

  try {
    await page.goto("/login?mode=signup");
    await page.locator("#lg-email").fill(email);
    await page.locator("#lg-password").fill(password);
    await page.locator("#lg-confirm").fill(password);
    await page.getByRole("button", { name: /^Criar conta$/ }).first().click();

    // 1) Entra logo: nada de "verifica o teu email" à espera de um email que não vem.
    await Promise.race([
      page.waitForURL(/\/wallets/, { timeout: 30_000 }),
      page.getByRole("alert").waitFor({ timeout: 30_000 }).then(async () => {
        throw new Error(`O registo não entrou: ${await page.getByRole("alert").innerText()}`);
      }),
    ]);
    criada = true;

    // 2) O exemplo aparece sozinho, e o campo para colar o endereço continua à vista,
    //    com o contador nas carteiras da pessoa (0), não nas do exemplo.
    await expect(page.getByText(/Conta de EXEMPLO/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#wl-quick")).toBeVisible();
    await expect(page.getByText(/Carteiras:\s*0\/3/)).toBeVisible();

    // 3) "Ligar a minha carteira" leva a esse campo.
    await page.getByRole("button", { name: /^Ligar a minha carteira$/ }).click();
    await expect(page.locator("#wl-quick")).toBeInViewport({ timeout: 5_000 });

    // 4) Colar um endereço a sério tira o exemplo e fica a carteira da pessoa.
    await page.locator("#wl-quick").fill(ENDERECO_TESTE);
    await page.getByRole("button", { name: /^Adicionar$/ }).click();
    await expect(page.getByText(/Conta de EXEMPLO/)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/Carteiras:\s*1\/3/)).toBeVisible();
  } finally {
    // Apaga a conta e todos os dados, passe ou falhe (a sessão está nos cookies da página).
    if (criada) {
      const r = await page.request.post("/api/account/delete");
      expect(r.ok(), `Não foi possível apagar a conta de teste ${email} (${r.status()})`).toBeTruthy();
    }
  }
});
