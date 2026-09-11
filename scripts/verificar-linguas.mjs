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

const T = readFileSync("src/lib/i18n/translations.ts", "utf8").split("\n");
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
