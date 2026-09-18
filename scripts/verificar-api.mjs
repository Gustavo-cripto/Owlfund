#!/usr/bin/env node
// Verifica a API pública e o servidor MCP no site A CORRER.
//
//   node scripts/verificar-api.mjs                 (chainfolioai.com)
//   node scripts/verificar-api.mjs http://localhost:3001
//
// Porque existe: a 18 de setembro de 2026 publiquei o /api/v1/global e ele
// respondia 200 com TODOS os campos a null — a chamada à fonte falhava e o
// código engolia o erro. Compilava, os testes passavam, o deploy ficou verde, e
// só se viu porque alguém foi lá com o curl. Isto faz esse curl sozinho, a
// todos os endpoints, e é a LISTA DO SITE que manda: se amanhã acrescentar um
// endpoint e me esquecer de o testar, ele entra aqui automaticamente.
//
// O que NÃO consegue ver: se um endpoint com chave devolve números certos —
// isso precisa da conta de teste (E2E_EMAIL/E2E_PASSWORD, ver e2e/).
//
// Sai com código 1 se algo falhar — serve para CI.

const BASE = (process.argv[2] ?? "https://chainfolioai.com").replace(/\/$/, "");
const TIMEOUT = 20_000;

let falhas = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const mal = (msg) => { falhas++; console.log(`  ❌ ${msg}`); };

async function pedir(caminho, init = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + caminho, { signal: AbortSignal.timeout(TIMEOUT), ...init });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* nem tudo é JSON */ }
    return { res, json, texto, ms: Date.now() - t0 };
  } catch (e) {
    return { res: null, json: null, texto: "", ms: Date.now() - t0, erro: String(e) };
  }
}

/** Um objeto "vazio na prática": existe, mas todos os valores úteis são null/0. */
function semConteudo(valor) {
  if (valor == null) return true;
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor !== "object") return false;
  const uteis = Object.entries(valor)
    // timestamp e afins estão sempre preenchidos e não provam nada.
    .filter(([k]) => !/^(timestamp|updatedAt|checkedAt|verificadoEm|upstreamStatus|note|source|currency|method)$/i.test(k))
    .map(([, v]) => v);
  if (uteis.length === 0) return false;
  return uteis.every((v) => v === null || v === 0 || (Array.isArray(v) && v.length === 0));
}

// ── 1) O índice, que é a lista de verdade ───────────────────────────────────
console.log(`\n── 1) Índice da API em ${BASE}`);
const indice = await pedir("/api/v1");
if (!indice.res?.ok || !indice.json) {
  mal(`/api/v1 não respondeu (${indice.res?.status ?? indice.erro})`);
  console.log("\nSem o índice não há nada para verificar.");
  process.exit(1);
}
const endpoints = indice.json.endpoints ?? [];
const tools = indice.json.mcp?.tools ?? [];
ok(`${endpoints.length} endpoints e ${tools.length} ferramentas MCP declarados`);
if (endpoints.length === 0) mal("o índice não declara endpoints");
if (tools.length === 0) mal("o índice não declara ferramentas MCP");

// ── 2) Cada endpoint faz o que diz ──────────────────────────────────────────
console.log(`\n── 2) Comportamento de cada endpoint`);
for (const e of endpoints) {
  if (e.path === "/api/v1") continue;
  // Parâmetros mínimos para os que os exigem (senão dariam 400 e não se via nada).
  const extra = { "/api/v1/price": "?symbol=btc", "/api/v1/tax-estimate": "?country=PT",
                  "/api/v1/price-on": "?symbol=BTC&date=2026-01-15", "/api/v1/whales": "?watchlist=[]" };
  const caminho = e.path + (extra[e.path] ?? "");
  const r = await pedir(caminho, e.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: "{}" } : {});

  if (!r.res) { mal(`${e.path} sem resposta (${r.erro})`); continue; }

  if (e.auth) {
    // Protegido: sem chave tem de recusar. Um 200 aqui seria uma fuga de dados.
    if (r.res.status === 401) ok(`${e.path} exige chave (401)`);
    else mal(`${e.path} devolveu ${r.res.status} SEM CHAVE — deveria ser 401`);
    continue;
  }

  // Público: tem de responder e trazer conteúdo a sério.
  if (!r.res.ok) { mal(`${e.path} público devolveu ${r.res.status}`); continue; }
  if (!r.json) { mal(`${e.path} não devolveu JSON`); continue; }
  if (semConteudo(r.json)) {
    mal(`${e.path} respondeu 200 mas VAZIO (todos os campos a null/0) — foi este o erro de 18 set`);
    continue;
  }
  const aviso = r.json.upstreamStatus ? ` (fonte devolveu ${r.json.upstreamStatus})` : "";
  ok(`${e.path} com conteúdo, ${r.ms} ms${aviso}`);
}

// ── 3) O servidor MCP ───────────────────────────────────────────────────────
console.log(`\n── 3) Servidor MCP`);
const mcp = await pedir("/api/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verificar-api", version: "1" } } }),
});
if (mcp.res?.status === 401) ok("/api/mcp exige chave (401)");
else mal(`/api/mcp devolveu ${mcp.res?.status ?? mcp.erro} — deveria ser 401 sem chave`);

const wwwAuth = mcp.res?.headers.get("www-authenticate") ?? "";
if (/resource_metadata=/.test(wwwAuth)) ok("diz aos clientes onde está a documentação (WWW-Authenticate)");
else mal(`WWW-Authenticate sem resource_metadata: "${wwwAuth}"`);

const meta = await pedir("/.well-known/oauth-protected-resource");
if (meta.json?.resource?.endsWith("/api/mcp") && meta.json?.resource_documentation) {
  ok("metadados do recurso apontam para /api/mcp e para a documentação");
} else {
  mal("metadados do recurso (.well-known) errados ou em falta");
}

// ── 4) A documentação existe e fala dos mesmos endpoints ────────────────────
console.log(`\n── 4) Documentação`);
const docs = await pedir("/developers");
if (docs.res?.ok) {
  ok("/developers responde");
  const emFalta = endpoints
    .map((e) => e.path)
    .filter((p) => p !== "/api/v1" && !docs.texto.includes(p));
  if (emFalta.length === 0) ok("todos os endpoints do índice aparecem na página");
  else mal(`endpoints fora da documentação: ${emFalta.join(", ")}`);
} else {
  mal(`/developers devolveu ${docs.res?.status ?? docs.erro}`);
}

console.log(falhas === 0
  ? "\n✅ API e MCP em ordem."
  : `\n${falhas} problema(s).`);
process.exit(falhas === 0 ? 0 : 1);
