#!/usr/bin/env node
// Porta de auditoria das dependências de PRODUÇÃO (npm audit --omit=dev).
//
//   node scripts/auditar-dependencias.mjs          (ou: npm run auditar)
//
// Lê o package-lock.json (não precisa de node_modules) e sai com código 1 se
// aparecer um aviso crítico ou alto que não esteja na lista de exceções abaixo.
// Corre todas as noites no workflow site-noturno e serve para CI.
//
// Regras da lista de exceções:
// - cada entrada diz PORQUÊ o aviso não chega ao site a correr e ATÉ QUANDO
//   a exceção vale; passada a data, a porta volta a falhar para se rever;
// - uma exceção que já não aparece na auditoria é avisada (está a mais);
// - moderados e baixos são só listados, não falham. Moderados conhecidos a
//   6 out 2026: @solana/web3.js → jayson 4.3 → stream-json 1.9 (a correção é o
//   jayson 5, que o web3.js 1.x não aceita; o web3.js usa o cliente de browser
//   do jayson, que nunca toca no stream-json).
//
// O que NÃO faz: `npm audit fix --force` (muda versões major) nem
// `--omit=dev` no fix (apaga as devDependencies). Esses são à mão.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Resumo curto para o aviso no Telegram (o workflow passa AUDIT_RESUMO com um
// caminho): pacote, versões afetadas e aviso, para se perceber sem abrir o GitHub.
const resumo = [];

/** Exceções aceites: pacote → { motivo, ate (AAAA-MM-DD) }. */
// Vazia desde 2 nov 2026: a cadeia react-native/metro e o braces/micromatch
// deixaram de aparecer; o @modelcontextprotocol/sdk (GHSA-6qxp-vccf-f47h)
// ficou resolvido com o SDK 1.32 sem passar ao mcp-handler 2 — o package.json
// tem um override que deixa o mcp-handler 1.1 (que fixa o SDK em 1.26) usar o
// SDK do projeto; e a zod 4.6.7 é forçada em todas as dependências
// (GHSA-mrhx-c7xc-m3w5; a Reown e a Coinbase traziam cópias da zod 3).
const EXCECOES = {};

const hoje = new Date().toISOString().slice(0, 10);

let saida;
try {
  saida = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  // npm audit sai com código ≠ 0 quando há vulnerabilidades; o JSON vem no stdout.
  saida = e.stdout?.toString() ?? "";
  if (!saida.trim()) { console.error("npm audit não devolveu JSON:", e.stderr?.toString() ?? e.message); process.exit(2); }
}

let relatorio;
try { relatorio = JSON.parse(saida); } catch { console.error("Resposta do npm audit não é JSON:", saida.slice(0, 400)); process.exit(2); }
if (relatorio.error) { console.error("npm audit falhou:", relatorio.error.summary ?? relatorio.error); process.exit(2); }

const vulns = relatorio.vulnerabilities ?? {};
const meta = relatorio.metadata?.vulnerabilities ?? {};
console.log(`Auditoria de produção: ${JSON.stringify(meta)}`);

let falhas = 0;
const aviso = (m) => console.log(`  ⚠️  ${m}`);
const mal = (m) => { falhas++; console.log(`  ❌ ${m}`); };
const ok = (m) => console.log(`  ✅ ${m}`);

const titulos = (v) => (v.via ?? []).filter((x) => typeof x !== "string").map((x) => `${x.title} (${x.url})`);

for (const [nome, v] of Object.entries(vulns)) {
  const grave = v.severity === "critical" || v.severity === "high";
  const exc = EXCECOES[nome];
  const fix = v.fixAvailable === true ? "npm audit fix resolve" : v.fixAvailable ? `só com major (${v.fixAvailable.name}@${v.fixAvailable.version})` : "sem correção publicada";
  if (!grave) { console.log(`  ℹ️  ${v.severity}: ${nome} ${v.range} — ${fix}`); continue; }
  const ghsa = (v.via ?? []).filter((x) => typeof x !== "string").map((x) => String(x.url ?? "").split("/").pop()).filter(Boolean);
  if (!exc) { resumo.push(`${v.severity.toUpperCase()} ${nome} ${v.range}${ghsa.length ? " · " + ghsa.join(", ") : ""} · ${fix}`); mal(`${v.severity.toUpperCase()}: ${nome} ${v.range} — ${fix}${titulos(v).length ? "\n       " + titulos(v).join("\n       ") : ""}`); continue; }
  if (exc.ate < hoje) { resumo.push(`${v.severity.toUpperCase()} ${nome} · exceção expirou a ${exc.ate}`); mal(`${v.severity.toUpperCase()}: ${nome} — exceção expirou a ${exc.ate} (${exc.motivo}); rever e renovar ou corrigir`); continue; }
  ok(`${v.severity}: ${nome} — exceção até ${exc.ate}: ${exc.motivo}`);
}

for (const nome of Object.keys(EXCECOES)) {
  if (!vulns[nome]) aviso(`exceção a mais: ${nome} já não aparece na auditoria — apagar da lista`);
}

if (process.env.AUDIT_RESUMO) {
  try { writeFileSync(process.env.AUDIT_RESUMO, resumo.join("\n")); } catch { /* o resumo é só para o aviso */ }
}

if (falhas) {
  console.log(`\n❌ ${falhas} aviso(s) grave(s) sem exceção. Corrigir com \`npm audit fix\` (sem --force) ou justificar em scripts/auditar-dependencias.mjs.`);
  process.exit(1);
}
console.log("\n✅ Dependências de produção sem avisos graves fora das exceções.");
