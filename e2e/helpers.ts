import { expect, type Page } from "@playwright/test";

// Apanha erros de JavaScript (excecoes nao tratadas) e console.error durante
// um teste. Um site "que abre" mas rebenta em silencio nao passa.
//
// Ignora-se o que nao e nosso nem e defeito: recursos externos que falham
// (favicons de tokens, imagens de NFTs) e avisos do React em dev.
const IGNORAR = [
  /Failed to load resource/i,            // 4xx/5xx de imagens/APIs externas — cobertas por outros testes
  /net::ERR_/i,
  /third-party cookie/i,
  /hydration/i,                          // avisos, nao erros funcionais
  /Download the React DevTools/i,
];

export function vigiarErros(page: Page): { erros: string[]; verificar: () => void } {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const texto = msg.text();
    if (IGNORAR.some((re) => re.test(texto))) return;
    erros.push(`console.error: ${texto.slice(0, 300)}`);
  });
  return {
    erros,
    verificar: () => expect(erros, `Erros de JS na pagina:\n${erros.join("\n")}`).toEqual([]),
  };
}

/** Espera que a pagina privada tenha carregado de facto (sem esqueleto nem "A carregar"). */
export async function esperarConteudo(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("[aria-busy='true']")).toHaveCount(0, { timeout: 30_000 });
}
