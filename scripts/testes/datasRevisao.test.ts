// As datas em ISO (dateModified do Article + lastmod do sitemap) tem de bater
// com as datas ESCRITAS no texto que a pessoa le (lote G). Sao dois sitios a
// atualizar a mao; este teste falha se alguem mudar um e esquecer o outro.
//   COMPARE_DATE_MODIFIED  ↔  "reviewed" de compareCopy.ts nas 4 linguas (dia, mes e ano)
//   TAX_GUIDE_DATE_MODIFIED ↔ TAX_DATA_VERIFIED (mes e ano, pt e en)
import { COMPARE_DATE_MODIFIED } from "@/lib/compare/competitors";
import { COMPARE_COPY } from "@/lib/compare/compareCopy";
import { TAX_DATA_VERIFIED, TAX_GUIDE_DATE_MODIFIED } from "@/lib/tax/countries";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? `: ${extra}` : ""}`); };

const MESES: Record<"pt" | "en" | "es" | "fr", string[]> = {
  pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
  en: ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
};

const iso = (d: string) => { const [a, m, dia] = d.split("-").map(Number); return { ano: a, mes: m, dia }; };

/** Todas as datas "D <mes> AAAA" / "D de <mes> de AAAA" / "<mes> [de] AAAA" num texto. */
function datasNoTexto(texto: string, lang: keyof typeof MESES): Array<{ ano: number; mes: number; dia: number | null }> {
  const out: Array<{ ano: number; mes: number; dia: number | null }> = [];
  const t = texto.toLowerCase();
  MESES[lang].forEach((nome, i) => {
    const re = new RegExp(`(?:(\\d{1,2})(?:er)?\\s+(?:de\\s+)?)?${nome}\\s+(?:de\\s+)?(\\d{4})`, "g");
    for (const m of t.matchAll(re)) out.push({ ano: Number(m[2]), mes: i + 1, dia: m[1] ? Number(m[1]) : null });
  });
  return out;
}

// ── comparacoes: dia, mes e ano ──
ok("COMPARE_DATE_MODIFIED em ISO", /^\d{4}-\d{2}-\d{2}$/.test(COMPARE_DATE_MODIFIED), COMPARE_DATE_MODIFIED);
const c = iso(COMPARE_DATE_MODIFIED);
for (const lang of ["pt", "en", "es", "fr"] as const) {
  const texto = COMPARE_COPY[lang].reviewed;
  const datas = datasNoTexto(texto, lang);
  ok(`comparacoes ${lang}: uma data no "reviewed"`, datas.length === 1, texto);
  const d = datas[0];
  ok(`comparacoes ${lang}: ${d ? `${d.dia}/${d.mes}/${d.ano}` : "?"} = ${COMPARE_DATE_MODIFIED}`, !!d && d.ano === c.ano && d.mes === c.mes && d.dia === c.dia);
}

// ── guias fiscais: mes e ano ──
ok("TAX_GUIDE_DATE_MODIFIED em ISO", /^\d{4}-\d{2}-\d{2}$/.test(TAX_GUIDE_DATE_MODIFIED), TAX_GUIDE_DATE_MODIFIED);
const g = iso(TAX_GUIDE_DATE_MODIFIED);
for (const lang of Object.keys(TAX_DATA_VERIFIED) as Array<keyof typeof TAX_DATA_VERIFIED>) {
  const datas = datasNoTexto(TAX_DATA_VERIFIED[lang], lang);
  const d = datas[0];
  ok(`guias ${lang}: "${TAX_DATA_VERIFIED[lang]}" = ${g.mes}/${g.ano}`, datas.length === 1 && !!d && d.ano === g.ano && d.mes === g.mes);
}

// ── o proprio leitor (para o teste nao passar por nao encontrar nada) ──
ok("leitor: '20 de setembro de 2026'", JSON.stringify(datasNoTexto("Factos revistos a 20 de setembro de 2026.", "pt")) === JSON.stringify([{ ano: 2026, mes: 9, dia: 20 }]));
ok("leitor: 'September 2026' sem dia", JSON.stringify(datasNoTexto("September 2026", "en")) === JSON.stringify([{ ano: 2026, mes: 9, dia: null }]));
ok("leitor: '1er août 2026'", JSON.stringify(datasNoTexto("le 1er août 2026", "fr")) === JSON.stringify([{ ano: 2026, mes: 8, dia: 1 }]));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
