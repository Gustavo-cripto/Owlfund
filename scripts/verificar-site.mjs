#!/usr/bin/env node
// Verificação do site A CORRER, em produção. Sem dependências.
//
//   node scripts/verificar-site.mjs                 (chainfolioai.com)
//   node scripts/verificar-site.mjs https://preview-url.vercel.app
//
// Existe porque os defeitos que mais custaram só se viam no site servido, não
// no código: links que o grep não apanhava por estarem em expressões JSX,
// páginas com texto invisível, uma fonte de câmbios que passou a responder 301
// e só funcionava por acaso. Nada disto aparece num `tsc` ou num `build`.
//
// O que faz:
//   1. Rastreia as páginas públicas (4 línguas + guias) e testa TODOS os links
//      internos que encontra — um 404 num link é um beco sem saída no funil.
//   2. Bate em cada API pública e confere código, tempo e forma da resposta.
//   3. Confirma as fontes externas de que o servidor depende (um 301 hoje é um
//      404 amanhã).
//   4. Conta, em cada página traduzida, links que ainda apontem para as
//      versões portuguesas.
// Sai com código 1 se algo falhar — serve para correr antes de anunciar.

const BASE = (process.argv[2] ?? "https://chainfolioai.com").replace(/\/$/, "");
const LENTO_MS = 3000;
let falhas = 0;
const erro = (m) => { console.log(`  ❌ ${m}`); falhas++; };
const ok = (m) => console.log(`  ✅ ${m}`);
const aviso = (m) => console.log(`  ⚠️  ${m}`);

const pedir = async (url, opts = {}) => {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", ...opts });
    return { res, ms: Date.now() - t0, texto: opts.method === "HEAD" ? "" : await res.text() };
  } catch (e) {
    return { res: null, ms: Date.now() - t0, texto: "", falha: String(e).slice(0, 80) };
  }
};

// ── 1. Páginas públicas e todos os seus links ────────────────────────────────
console.log(`\n── 1) Páginas públicas em ${BASE}`);
const SEMENTES = [
  "/", "/en", "/es", "/fr",
  "/pricing", "/en/pricing", "/es/precios", "/fr/tarifs",
  "/como-funciona", "/en/how-it-works", "/es/como-funciona", "/fr/comment-ca-marche",
  "/beta", "/en/beta", "/es/beta", "/fr/beta",
  "/login", "/en/login", "/es/login", "/fr/login",
  "/termos", "/privacidade", "/developers",
  "/guias/impostos-cripto", "/guides/crypto-tax",
  "/guias/impostos-cripto/portugal", "/guides/crypto-tax/united-states",
];
const links = new Map(); // href → páginas onde aparece
for (const p of SEMENTES) {
  // Sem Accept-Language: é assim que o Googlebot rastreia e é o que queremos
  // ver — a versão portuguesa em "/" sem redirecionamento.
  const { res, ms, texto, falha } = await pedir(BASE + p);
  if (!res) { erro(`${p} — sem resposta (${falha})`); continue; }
  if (res.status !== 200) { erro(`${p} → ${res.status}`); continue; }
  const lang = (texto.match(/<html[^>]*\blang="([^"]+)"/) ?? [])[1] ?? "?";
  const title = (texto.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? "(sem título)";
  const h1 = /<h1[\s>]/.test(texto);
  const problemas = [];
  if (!h1) problemas.push("sem <h1>");
  if (ms > LENTO_MS) problemas.push(`${ms} ms`);
  (problemas.length ? aviso : ok)(`${p.padEnd(36)} ${lang.padEnd(6)} ${ms.toString().padStart(4)} ms  ${title.slice(0, 48)}${problemas.length ? "  [" + problemas.join(", ") + "]" : ""}`);
  for (const m of texto.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const href = m[1];
    if (href.startsWith("/_next") || href.startsWith("/api/") || /\.\w{2,5}$/.test(href)) continue;
    if (!links.has(href)) links.set(href, new Set());
    links.get(href).add(p);
  }
}

console.log(`\n── 2) ${links.size} links internos distintos encontrados nessas páginas`);
const PRIVADAS = /^\/(dashboard|portfolio|wallets|mercado|smart-money|gestor|fiscalidade|historico|fire|account|admin|crypto)(\/|$)/;
let quebrados = 0;
for (const [href, origens] of [...links].sort()) {
  const { res, falha } = await pedir(BASE + href, { method: "HEAD" });
  if (!res) { erro(`${href} — sem resposta (${falha}); em ${[...origens].join(", ")}`); quebrados++; continue; }
  const s = res.status;
  // Páginas privadas redirecionam para o login (307): é o comportamento certo.
  const aceitavel = s === 200 || (s >= 300 && s < 400 && (PRIVADAS.test(href) || href === "/"));
  if (!aceitavel) { erro(`${href} → ${s}; em ${[...origens].join(", ")}`); quebrados++; }
}
if (quebrados === 0) ok(`nenhum link quebrado`);

// ── 3. Links por localizar nas versões traduzidas ───────────────────────────
console.log(`\n── 3) Links para páginas portuguesas dentro das versões traduzidas`);
const PT_PUBLICAS = /^href="\/(pricing|beta|como-funciona|login)(\/|"|\?)/;
for (const p of ["/en", "/es", "/fr", "/en/pricing", "/fr/tarifs", "/es/beta"]) {
  const { texto } = await pedir(BASE + p);
  const n = (texto.match(/href="\/[^"]*"/g) ?? []).filter((h) => PT_PUBLICAS.test(h)).length;
  (n === 0 ? ok : erro)(`${p.padEnd(14)} ${n} por localizar`);
}

// ── 4. APIs públicas ────────────────────────────────────────────────────────
console.log(`\n── 4) APIs públicas`);
const APIS = [
  ["/api/fx", (j) => j.rates?.USD > 0 && j.rates?.BRL > 0 && j.rates?.BTC > 0, "rates USD/BRL/BTC"],
  ["/api/fx/historical?from=2024-01-10&to=2024-01-16&symbols=USD", (j) => Object.keys(j.rates ?? {}).length >= 4, "≥4 dias úteis"],
  ["/api/markets", (j) => Array.isArray(j.data) && j.data.length >= 5, "≥5 moedas"],
  ["/api/prices", (j) => typeof j === "object" && j !== null, "objeto"],
  ["/api/fear-greed", (j) => typeof j === "object" && j !== null, "objeto"],
  ["/api/btc-blocks", (j) => typeof j === "object" && j !== null, "objeto"],
];
for (const [path, valida, desc] of APIS) {
  const { res, ms, texto, falha } = await pedir(BASE + path);
  if (!res) { erro(`${path} — sem resposta (${falha})`); continue; }
  if (res.status !== 200) { erro(`${path} → ${res.status}`); continue; }
  let j; try { j = JSON.parse(texto); } catch { erro(`${path} — não é JSON`); continue; }
  if (!valida(j)) { erro(`${path} — resposta sem a forma esperada (${desc})`); continue; }
  (ms > LENTO_MS ? aviso : ok)(`${path.slice(0, 52).padEnd(52)} ${ms.toString().padStart(5)} ms`);
}

// ── 5. Fontes externas de que o servidor depende ────────────────────────────
console.log(`\n── 5) Fontes externas (um 301 hoje é um 404 amanhã)`);
const EXTERNAS = [
  "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD",
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur",
  "https://mempool.space/api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "https://blockstream.info/api/address/1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "https://api.twelvedata.com/quote?symbol=AAPL&apikey=demo",
];
for (const u of EXTERNAS) {
  const { res, ms, falha } = await pedir(u, { method: "GET", headers: { "User-Agent": "chainfolioai-check" } });
  const host = new URL(u).host;
  if (!res) { erro(`${host} — sem resposta (${falha})`); continue; }
  if (res.status >= 300 && res.status < 400) { erro(`${host} → ${res.status} redireciona para ${res.headers.get("location")} — atualizar o endereço no código`); continue; }
  if (res.status !== 200) { (res.status === 429 ? aviso : erro)(`${host} → ${res.status}`); continue; }
  ok(`${host.padEnd(24)} ${ms.toString().padStart(5)} ms`);
}

console.log(falhas === 0 ? "\n✅ Site a responder como deve." : `\n${falhas} problema(s).`);
process.exit(falhas === 0 ? 0 : 1);
