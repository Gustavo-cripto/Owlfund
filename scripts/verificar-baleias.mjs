#!/usr/bin/env node
// Valida os enderecos da lista de baleias conhecidas.
//
//   node scripts/verificar-baleias.mjs            (so checksum, offline, instantaneo)
//   node scripts/verificar-baleias.mjs --online   (confirma tambem na blockchain)
//
// Existe porque quatro carteiras BTC da lista (IRS/CI, BKA Movie2k, PlusToken e
// NBI Finlandia) tinham enderecos que falhavam o checksum — nao existiam. Quem
// as seguisse via apenas "Falha ao consultar o saldo BTC.", e a mensagem parecia
// uma avaria do site quando o problema era o dado.
//
// Sai com codigo 1 se algum endereco for invalido — serve para CI.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const SRC = readFileSync("src/lib/api/known-whales.ts", "utf8");
const ROWS = [...SRC.matchAll(/\{ address: "([^"]+)", label: "([^"]+)", chain: "([a-z]+)"/g)]
  .map((m) => ({ address: m[1], label: m[2], chain: m[3] }));

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(str) {
  let n = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = Buffer.from(hex === "0" ? "" : hex, "hex");
  const pad = str.length - str.replace(/^1+/, "").length;
  return Buffer.concat([Buffer.alloc(pad), body]);
}
const sha256 = (b) => createHash("sha256").update(b).digest();

/** Base58Check: 21 bytes de payload + 4 de checksum (duplo SHA-256). */
function base58CheckOk(addr) {
  const d = base58Decode(addr);
  if (!d || d.length !== 25) return false;
  return sha256(sha256(d.subarray(0, 21))).subarray(0, 4).equals(d.subarray(21));
}

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
/** bech32 (SegWit v0) e bech32m (Taproot) partilham o algoritmo; muda a constante. */
function bech32Ok(addr) {
  const a = addr.toLowerCase();
  const sep = a.lastIndexOf("1");
  if (sep < 1) return false;
  const hrp = a.slice(0, sep);
  const data = a.slice(sep + 1);
  if (data.length < 6) return false;
  const values = [];
  for (const c of data) {
    const i = CHARSET.indexOf(c);
    if (i < 0) return false;
    values.push(i);
  }
  const polymod = (v) => {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const x of v) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ x;
      for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
    }
    return chk >>> 0;
  };
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...values];
  const chk = polymod(expanded);
  return chk === 1 || chk === 0x2bc830a3;
}

function valido({ address, chain }) {
  if (chain === "btc") return /^(1|3)/.test(address) ? base58CheckOk(address) : bech32Ok(address);
  if (chain === "eth") return /^0x[0-9a-fA-F]{40}$/.test(address);
  if (chain === "sol") {
    const d = base58Decode(address);
    return d != null && d.length === 32;
  }
  return false;
}

const maus = ROWS.filter((r) => !valido(r));
const porRede = ROWS.reduce((acc, r) => ({ ...acc, [r.chain]: (acc[r.chain] ?? 0) + 1 }), {});
console.log(`${ROWS.length} carteiras · ${Object.entries(porRede).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
for (const r of maus) console.log(`  ❌ [${r.chain}] ${r.address} — ${r.label} (checksum invalido)`);

let falhasOnline = 0;
if (process.argv.includes("--online")) {
  // Confirmacao na blockchain: um endereco pode passar o checksum e mesmo assim
  // nunca ter sido usado. Aqui so avisamos — nao e motivo para falhar.
  const btc = ROWS.filter((r) => r.chain === "btc" && valido(r));
  console.log(`\nA confirmar ${btc.length} carteiras BTC na mempool.space...`);
  for (const r of btc) {
    try {
      const res = await fetch(`https://mempool.space/api/address/${r.address}`);
      if (!res.ok) { console.log(`  ❌ HTTP ${res.status} — ${r.label}`); falhasOnline++; continue; }
      const d = await res.json();
      const sat = (d.chain_stats?.funded_txo_sum ?? 0) - (d.chain_stats?.spent_txo_sum ?? 0);
      const marca = d.chain_stats?.tx_count ? "✅" : "⚠️ sem transacoes";
      console.log(`  ${marca} ${(sat / 1e8).toFixed(4).padStart(14)} BTC — ${r.label}`);
    } catch (e) {
      console.log(`  ⚠️  ${String(e).slice(0, 60)} — ${r.label}`);
    }
    await new Promise((r) => setTimeout(r, 1200));  // a API e gratuita; ir devagar
  }
}

console.log(maus.length === 0 ? "\n✅ Todos os enderecos passam o checksum." : `\n${maus.length} endereco(s) invalido(s).`);
process.exit(maus.length === 0 ? 0 : 1);
