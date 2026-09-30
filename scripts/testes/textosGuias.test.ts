// Defeitos mecanicos nos textos dos guias fiscais (30 set 2026): um script de
// edicao gravou "\\n" literal nos "Pontos a reter" de 19 paises e a pagina
// mostrava "\n" pelo meio do texto. Este teste apanha isso e parecidos.
import { translations } from "@/lib/i18n/translations";
import { COUNTRIES, TEXT_PREFIX } from "@/lib/tax/countries";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  if (!cond) console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
};
for (const lang of ["pt", "en", "es", "fr"] as const) {
  const dict = translations[lang] as Record<string, string>;
  for (const c of COUNTRIES) {
    const p = TEXT_PREFIX[c.code];
    for (const k of ["name", "short", "long", "thr", "sum", "kp"]) {
      const v = dict[`fc_${p}_${k}`] ?? "";
      const id = `${lang}.fc_${p}_${k}`;
      ok(`${id} existe`, v.trim().length > 0);
      ok(`${id} sem "\\n" literal`, !v.includes("\\n"), v.slice(Math.max(0, v.indexOf("\\n") - 30), v.indexOf("\\n") + 10));
      ok(`${id} sem marcador por preencher`, !/\{[a-z]+\}|undefined|NaN/.test(v));
    }
    const kp = (dict[`fc_${p}_kp`] ?? "").split("\n").filter(Boolean);
    ok(`${lang}.fc_${p}_kp tem pelo menos 3 pontos`, kp.length >= 3, `${kp.length}`);
    ok(`${lang}.fc_${p}_kp sem pontos repetidos`, new Set(kp).size === kp.length);
  }
}
if (fails) { console.log(`\n${fails} FALHA(S)`); process.exit(1); } else console.log("TODOS OK (21 países × 4 línguas)");
