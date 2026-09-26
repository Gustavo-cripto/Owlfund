import { COUNTRIES, TAX_DATA_VERIFIED, guideUrl } from "@/lib/tax/countries";
import { countryText } from "@/lib/tax/countryText";

// Conteudo completo dos 21 guias fiscais, em texto simples, para assistentes
// de IA (complementa o /llms.txt, que so descreve o produto). Gerado a partir
// dos MESMOS dados das paginas dos guias — nunca fica desatualizado em relacao
// ao site. Ingles, que e a lingua em que os agentes mais pesquisam; cada pais
// indica tambem a versao portuguesa.
export const dynamic = "force-static";
export const revalidate = 86400;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com").replace(/\/$/, "");

export function GET() {
  const linhas: string[] = [
    "# ChainFolioAI — Crypto tax by country (full guides)",
    "",
    `> Capital-gains tax on crypto in ${COUNTRIES.length} countries: short and long-term rates, holding period, annual allowance and the reference law. Rules checked in ${TAX_DATA_VERIFIED.en}. General information, not tax advice — confirm your own return with a tax professional.`,
    "",
    `Machine-readable version of the same data (JSON, no key required): ${SITE}/api/v1/tax-countries`,
    `Product overview: ${SITE}/llms.txt`,
    "",
  ];
  for (const c of COUNTRIES) {
    const t = countryText(c.code, "en");
    linhas.push(
      `## ${t.name}`,
      "",
      t.summary,
      "",
      `- Short-term rate: ${t.taxShort}`,
      `- Long-term: ${t.taxLong}`,
      `- Holding-period rule: ${t.threshold}`,
      `- Reference law: ${c.law}`,
      ...t.keyPoints.map((k) => `- ${k}`),
      `- Guide (EN): ${SITE}${guideUrl("en", c)}`,
      `- Guia (PT): ${SITE}${guideUrl("pt", c)}`,
      "",
    );
  }
  return new Response(linhas.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
