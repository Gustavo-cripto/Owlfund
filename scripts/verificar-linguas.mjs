#!/usr/bin/env node
// Verifica a saúde das traduções. Corre sem dependências: `node scripts/verificar-linguas.mjs`
//
// Existe por causa de dois enganos reais:
//   • 22 páginas publicadas com texto branco sobre fundo branco, porque nunca
//     foram abertas num browser (ver a secção CONTRASTE no fim do ficheiro);
//   • guias em inglês com frases em português, porque os textos dos regimes
//     fiscais só tinham `pt`.
//
// O que valida:
//   1. As 4 línguas têm exatamente as mesmas chaves (e nenhuma repetida).
//   2. As chaves construídas em runtime (fc_<país>_*) existem nas 4.
//   3. Nenhum país fica sem prefixo de tradução.
// Sai com código 1 se algo falhar — serve para CI.

import { readFileSync } from "node:fs";

// Uma lingua por ficheiro (src/lib/i18n/messages/*.ts); junta-se tudo com o
// marcador "  xx: {" que o resto do script sempre usou para delimitar blocos.
const T = ["pt", "en", "es", "fr"].flatMap((l) => [`  ${l}: {`, ...readFileSync(`src/lib/i18n/messages/${l}.ts`, "utf8").split("\n")]);
const C = readFileSync("src/lib/tax/countries.ts", "utf8");
const LANGS = ["pt", "en", "es", "fr"];
let falhas = 0;
const erro = (m) => { console.log(`  ❌ ${m}`); falhas++; };

// ── 1. paridade de chaves ───────────────────────────────────────────────────
const inicio = {};
T.forEach((l, i) => { const m = /^ {2}(pt|en|es|fr): \{/.exec(l); if (m) inicio[m[1]] = i + 1; });
const fim = Object.fromEntries(LANGS.map((l, i) => [l, i + 1 < LANGS.length ? inicio[LANGS[i + 1]] - 1 : T.length]));
// O ficheiro tem chaves em linha própria E várias na mesma linha — apanha ambas.
const CHAVE = /(?:^ {4}|,\s)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?=["'`])/g;
const chaves = {};
for (const l of LANGS) {
  const ks = [];
  for (const linha of T.slice(inicio[l], fim[l])) ks.push(...[...linha.matchAll(CHAVE)].map((m) => m[1]));
  chaves[l] = ks;
}
console.log("── Chaves por língua");
for (const l of LANGS) {
  const dup = [...new Set(chaves[l].filter((k, i) => chaves[l].indexOf(k) !== i))];
  console.log(`  ${l}: ${chaves[l].length}`);
  if (dup.length) erro(`${l}: chaves repetidas → ${dup.join(", ")}`);
}
const base = new Set(chaves.pt);
for (const l of LANGS.slice(1)) {
  const s = new Set(chaves[l]);
  for (const k of base) if (!s.has(k)) erro(`${l}: falta a chave ${k}`);
  for (const k of s) if (!base.has(k)) erro(`${l}: tem ${k}, que não existe em pt`);
}

// ── 2/3. países: prefixo e as 6 chaves de texto em cada língua ──────────────
const prefixos = Object.fromEntries(
  [...C.slice(C.indexOf("TEXT_PREFIX")).slice(0, C.slice(C.indexOf("TEXT_PREFIX")).indexOf("};"))
    .matchAll(/([A-Z]{2}): "([a-z]{2})"/g)].map((m) => [m[1], m[2]]),
);
const codigos = [...C.matchAll(/\{ code: "([A-Z]{2})"/g)].map((m) => m[1]);
const presente = Object.fromEntries(LANGS.map((l) => [l, new Set(chaves[l])]));
console.log(`── Países: ${codigos.length} × 6 chaves × 4 línguas`);
for (const c of codigos) {
  const p = prefixos[c];
  if (!p) { erro(`${c} não tem prefixo em TEXT_PREFIX (o guia sairia com o texto de Portugal)`); continue; }
  for (const sufixo of ["name", "short", "long", "thr", "sum", "kp"]) {
    const k = `fc_${p}_${sufixo}`;
    const faltam = LANGS.filter((l) => !presente[l].has(k));
    if (faltam.length) erro(`${k} falta em ${faltam.join(", ")}`);
  }
}

// ── 4. contagens da API escritas à mão ──────────────────────────────────────
// A landing, o Como Funciona e a Conta diziam "12 endpoints / 11 ferramentas"
// quando já eram 24/23. Os números vêm de src/lib/api/catalog.ts via os
// placeholders {endpoints}/{tools}; um literal aqui é regressão.
console.log("── Contagens da API (endpoints/ferramentas) escritas à mão");
const LITERAL_API = /\b\d+\s+(endpoints?|ferramentas?|tools?|herramientas?|outils?)\b/i;
for (const f of [...LANGS.map((l) => `src/lib/i18n/messages/${l}.ts`), "src/app/(pt)/account/page.tsx"]) {
  readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
    if (linha.trimStart().startsWith("//")) return;
    const m = LITERAL_API.exec(linha);
    if (m) erro(`${f}:${i + 1}: "${m[0]}" escrito à mão — usa {endpoints}/{tools} + preencherContagens()`);
  });
}

// ── 5. números diferentes entre línguas na mesma chave ──────────────────────
// O espanhol dizia "15+ fuentes" onde as outras diziam "19 redes". Para cada
// chave, o conjunto de números tem de ser o mesmo nas 4 línguas. Normaliza os
// separadores de milhar/decimais (14,99 = 14.99 = 10 000) e ignora cores hex
// e URLs, que variam sem ser erro.
console.log("── Números por chave iguais nas 4 línguas");
const VALOR = /(?:^ {4}|,\s)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;
const numeros = (s) => {
  const limpo = s
    .replace(/\\u\{[0-9a-fA-F]+\}|\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/g, " ") // escapes — etc. nao sao numeros
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[0-9a-fA-F]{3,8}\b/g, " ")
    .replace(/(\d)[   .,](?=\d)/g, "$1")
    .replace(/(\d+)[   ]?k\b/g, (_, n) => `${n}000`); // $100k = 100 k$ = 100 000 $
  return [...new Set(limpo.match(/\d+/g) ?? [])].sort().join(",");
};
// Chaves em que uma língua escreve o número por extenso ("1 ano" vs "un an",
// "1 minuto" vs "une minute"). Cada entrada é uma decisão, não uma exceção cega.
const POR_EXTENSO = new Set(["dash_plan_pro_desc", "dash_cta_pro_desc", "wl_quotes_rate", "fisc_pdf_notes_text", "fc_de_sum"]);
const valores = {};
for (const l of LANGS) {
  valores[l] = {};
  for (const linha of T.slice(inicio[l], fim[l])) {
    for (const m of linha.matchAll(VALOR)) valores[l][m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
}
let comparadas = 0;
for (const k of Object.keys(valores.pt)) {
  if (POR_EXTENSO.has(k)) continue;
  const ref = numeros(valores.pt[k]);
  comparadas++;
  for (const l of LANGS.slice(1)) {
    if (!(k in valores[l])) continue;
    const outro = numeros(valores[l][k]);
    if (outro !== ref) erro(`${k}: números diferentes — pt [${ref}] vs ${l} [${outro}]`);
  }
}
console.log(`  ${comparadas} chaves comparadas`);

console.log(falhas === 0 ? "\n✅ Traduções em ordem." : `\n${falhas} problema(s).`);
process.exit(falhas === 0 ? 0 : 1);

// ── CONTRASTE (verificação manual, 30 segundos) ─────────────────────────────
// Um texto pode ter todas as chaves certas e continuar invisível. Abre a página
// no browser e cola isto na consola — devolve o texto cujo contraste com o
// fundo real é baixo de mais para se ler. Faz nos DOIS temas (claro e escuro):
//
//   (l=>{const px=c=>{const m=(c||"").match(/[\d.]+/g);return m?m.slice(0,3).map(Number):null};
//   const lu=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
//   return .2126*f(r)+.7152*f(g)+.0722*f(b)};const ra=(a,b)=>{const x=lu(a),y=lu(b);
//   return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const eb=e=>{let n=e;
//   while(n&&n!==document.documentElement){const s=getComputedStyle(n);
//   if((s.backgroundImage||"none")!=="none")return null;const c=s.backgroundColor,
//   a=(c.match(/[\d.]+/g)||[])[3];if(px(c)&&a!=="0"&&c!=="transparent")return px(c);
//   n=n.parentElement}return [255,255,255]};const o=[];document.querySelectorAll("body *")
//   .forEach(e=>{if(e.children.length)return;const t=(e.textContent||"").trim();if(t.length<3)return;
//   const s=getComputedStyle(e);if(s.visibility==="hidden"||s.display==="none"||s.opacity==="0")return;
//   const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return;const f=px(s.color);if(!f)return;
//   const b=eb(e);if(!b)return;const c=ra(f,b);if(c<l)o.push({txt:t.slice(0,50),ratio:+c.toFixed(2),
//   cls:(e.className||"").toString().slice(0,60)})});return {url:location.pathname,invisiveis:o.length,
//   exemplos:o.slice(0,6)}})(2.0)
//
// Regra que evita o problema à partida: toda a página pública tem de estar
// dentro de <AppShell> + <div className="min-h-screen bg-slate-950 text-slate-100">.
