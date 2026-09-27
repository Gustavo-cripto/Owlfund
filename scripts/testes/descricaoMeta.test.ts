import { descricaoMeta } from "@/lib/seo/descricao";
let fails = 0;
const eq = (name: string, got: string, want: string) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : `\n   (esperado ${want})`}`); };
const le = (name: string, got: string, max: number) => { const ok = got.length <= max; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got.length} chars`); };

const PT = "Mais-valias cripto com detenção superior a 365 dias são isentas de imposto (desde 2023). Abaixo disso, aplica-se uma taxa de 28% sobre o lucro. Obrigatório declarar no IRS (Anexo G).";
// Com a 2.a frase ficariam 158 caracteres: para na 1.a (fim de frase, nunca a meio).
eq("base + frases que cabem", descricaoMeta("Portugal: 28%", PT),
  "Portugal: 28%. Mais-valias cripto com detenção superior a 365 dias são isentas de imposto (desde 2023).");
le("nunca passa o limite", descricaoMeta("Portugal: 28%", PT), 155);
// Com limite maior a 2.a frase ja entra; a 3.a nao.
eq("limite 160 → 2 frases", descricaoMeta("Portugal: 28%", PT, 160),
  "Portugal: 28%. Mais-valias cripto com detenção superior a 365 dias são isentas de imposto (desde 2023). Abaixo disso, aplica-se uma taxa de 28% sobre o lucro.");

// Ponto dentro de numero e parentese nao cortam a frase.
const NL = "Os Países Baixos NÃO tributam as mais-valias realizadas: a cripto entra no 'Box 3' (património), que aplica 36% sobre um rendimento presumido de ~6%/ano — na prática ~2,2% do valor detido a 1 de janeiro, acima da isenção de €59.357 (2026). Reforma para tributar rendimentos reais prevista para 2028.";
const nl = descricaoMeta("Países Baixos: 36% (Box 3)", NL);
le("1.a frase nao cabe → corta em palavra", nl, 155);
eq("termina com reticencias", nl.endsWith("…") ? "…" : nl.slice(-3), "…");
eq("nao corta no ponto do numero", nl.startsWith("Países Baixos: 36% (Box 3). Os Países Baixos NÃO tributam") ? "ok" : nl, "ok");

// Base ja com ponto final nao duplica; base vazia usa so o texto.
eq("base com ponto", descricaoMeta("Alemanha: isento após 1 ano.", "Frase curta. Outra frase."), "Alemanha: isento após 1 ano. Frase curta. Outra frase.");
eq("sem base", descricaoMeta("", "Frase curta. Outra frase."), "Frase curta. Outra frase.");

// "(CGT). Para" e um fim de frase real (ponto + espaco + maiuscula).
const SG = "Singapura não tem imposto sobre mais-valias (CGT). Para investidores privados, os ganhos cripto são geralmente isentos de imposto. Se o trading for considerado atividade comercial habitual, os lucros podem ser tributados como rendimento empresarial.";
eq("corta em fim de frase real", descricaoMeta("Singapura: 0% (investidor privado)", SG),
  "Singapura: 0% (investidor privado). Singapura não tem imposto sobre mais-valias (CGT).");
eq("com espaco para a 2.a frase", descricaoMeta("Singapura: 0% (investidor privado)", SG, 170),
  "Singapura: 0% (investidor privado). Singapura não tem imposto sobre mais-valias (CGT). Para investidores privados, os ganhos cripto são geralmente isentos de imposto.");

// Limite proprio: "A: 1%. Um. Dois." tem 16; com 15 fica so "Um.".
eq("limite pequeno (16)", descricaoMeta("A: 1%", "Um. Dois. Três.", 16), "A: 1%. Um. Dois.");
eq("limite pequeno (15)", descricaoMeta("A: 1%", "Um. Dois. Três.", 15), "A: 1%. Um.");

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
