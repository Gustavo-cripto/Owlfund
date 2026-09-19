import { COUNTRIES, moedaDoRelatorio } from "@/lib/tax/countries";
import { fxSuportada } from "@/lib/fx/supported";

// Impede que volte a entrar em producao um pais cuja moeda nao tem cambio
// publicado. Antes, Emirados (AED) e Argentina (ARS) produziam um relatorio com
// TODOS os lotes descartados e imposto zero, com ar de resposta.

let fails = 0;
const ok = (name: string, cond: boolean, detalhe = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "✅" : "❌"} ${name}${detalhe ? `: ${detalhe}` : ""}`);
};

const semCambio = COUNTRIES.filter((c) => !fxSuportada(c.currency));
console.log(`   ${COUNTRIES.length} paises; ${semCambio.length} sem cambio publicado: ${semCambio.map((c) => `${c.code}/${c.currency}`).join(", ") || "nenhum"}`);

// Todo o pais tem de acabar com uma moeda em que o relatorio SAI mesmo.
for (const c of COUNTRIES) {
  const r = moedaDoRelatorio(c);
  ok(`${c.code}: moeda do relatorio tem cambio`, fxSuportada(r.currency), `${c.currency} -> ${r.currency}${r.fallback ? " (queda para EUR)" : ""}`);
}

// A queda para euros so pode acontecer quando ha mesmo falta de cambio.
for (const c of COUNTRIES) {
  const r = moedaDoRelatorio(c);
  ok(`${c.code}: so cai para EUR se preciso`, r.fallback === !fxSuportada(c.currency));
}

// A lista de moedas suportadas nao pode encolher sem se dar por isso.
ok("EUR esta coberto", fxSuportada("EUR"));
ok("USD esta coberto", fxSuportada("USD"));
ok("AED continua sem cobertura (se mudar, atualizar a lista)", !fxSuportada("AED"));

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
