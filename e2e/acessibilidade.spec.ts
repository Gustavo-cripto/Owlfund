import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Auditoria automatica de acessibilidade (axe-core, WCAG 2.1 A/AA) nas paginas
// publicas. Apanha o que se mede por regra: contraste, botoes sem nome,
// imagens sem alt, campos sem etiqueta, ordem de cabecalhos, ARIA invalido.
// O que nao se mede (foco visivel a olho, sentido dos textos) fica para a
// revisao manual.

const PAGINAS = ["/", "/como-funciona", "/login", "/pricing", "/beta", "/en", "/termos"];

for (const path of PAGINAS) {
  test(`axe: ${path} sem violações WCAG A/AA`, async ({ page }) => {
    await page.goto(path);
    // Em dev o HMR nunca deixa a rede "parada"; 5 s chegam para o conteudo assentar.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // O ticker anima sozinho e o axe le-o a meio do movimento; e decorativo.
      .exclude(".animate-ticker")
      .analyze();
    const resumo = resultado.violations.map((v) =>
      `${v.id} (${v.impact}) — ${v.help}\n` + v.nodes.slice(0, 3).map((n) => `    ${n.html.slice(0, 140)}`).join("\n"),
    );
    expect(resumo, `Violações em ${path}:\n${resumo.join("\n")}`).toEqual([]);
  });
}
