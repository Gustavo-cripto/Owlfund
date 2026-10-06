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

/** Exceções aceites: pacote → { motivo, ate (AAAA-MM-DD) }. */
const EXCECOES = {
  // Cadeia react-native/metro puxada por @walletconnect/keyvaluestorage →
  // @react-native-async-storage/async-storage. Só se executa numa app React
  // Native; no site (browser + Node na Vercel) nunca é importada.
  "react-native": { motivo: "só corre em app React Native; o site nunca a importa (via WalletConnect)", ate: "2027-01-31" },
  "@react-native/community-cli-plugin": { motivo: "CLI do React Native, nunca executada no site", ate: "2027-01-31" },
  "@react-native/virtualized-lists": { motivo: "componente React Native, nunca executado no site", ate: "2027-01-31" },
  "metro": { motivo: "bundler do React Native, nunca executado no site", ate: "2027-01-31" },
  "metro-config": { motivo: "bundler do React Native, nunca executado no site", ate: "2027-01-31" },
  "metro-file-map": { motivo: "bundler do React Native, nunca executado no site", ate: "2027-01-31" },
  "metro-transform-worker": { motivo: "bundler do React Native, nunca executado no site", ate: "2027-01-31" },
  // braces/micromatch: o aviso GHSA-vfj7-8cjw-p6xm cobre todas as versões 3.x
  // (<=3.0.3) e a única correção é o Tailwind 4 (major). Só se usam no build
  // (chokidar/tailwindcss 3), com padrões nossos, nunca com entrada de utilizador.
  "braces": { motivo: "só no build (tailwindcss 3 → chokidar); a correção é Tailwind 4", ate: "2027-01-31" },
  "micromatch": { motivo: "só no build (tailwindcss 3); a correção é Tailwind 4", ate: "2027-01-31" },
};

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
  if (!exc) { mal(`${v.severity.toUpperCase()}: ${nome} ${v.range} — ${fix}${titulos(v).length ? "\n       " + titulos(v).join("\n       ") : ""}`); continue; }
  if (exc.ate < hoje) { mal(`${v.severity.toUpperCase()}: ${nome} — exceção expirou a ${exc.ate} (${exc.motivo}); rever e renovar ou corrigir`); continue; }
  ok(`${v.severity}: ${nome} — exceção até ${exc.ate}: ${exc.motivo}`);
}

for (const nome of Object.keys(EXCECOES)) {
  if (!vulns[nome]) aviso(`exceção a mais: ${nome} já não aparece na auditoria — apagar da lista`);
}

if (falhas) {
  console.log(`\n❌ ${falhas} aviso(s) grave(s) sem exceção. Corrigir com \`npm audit fix\` (sem --force) ou justificar em scripts/auditar-dependencias.mjs.`);
  process.exit(1);
}
console.log("\n✅ Dependências de produção sem avisos graves fora das exceções.");
