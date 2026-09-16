import { createHash } from "node:crypto";

// Validacao real de enderecos Bitcoin (so servidor: usa node:crypto).
//
// Existe porque um regex de formato deixa passar enderecos que nao existem —
// quatro "baleias" da lista antiga falhavam o checksum e quem as seguia via
// "Falha ao consultar o saldo BTC.", como se o site estivesse avariado, quando
// o problema era o dado. Com checksum, a resposta passa a ser "endereco
// invalido" e o utilizador sabe o que remover.
//
// Mesmo algoritmo de scripts/verificar-baleias.mjs (Base58Check para 1…/3…,
// bech32/bech32m para bc1…).

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Buffer | null {
  let n = BigInt(0);
  const base = BigInt(58);
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * base + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = Buffer.from(hex === "0" ? "" : hex, "hex");
  const pad = str.length - str.replace(/^1+/, "").length;
  return Buffer.concat([Buffer.alloc(pad), body]);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

/** Base58Check: 21 bytes de payload + 4 de checksum (duplo SHA-256). */
function base58CheckOk(addr: string): boolean {
  const d = base58Decode(addr);
  if (!d || d.length !== 25) return false;
  return sha256(sha256(d.subarray(0, 21))).subarray(0, 4).equals(d.subarray(21));
}

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** bech32 (SegWit v0) e bech32m (Taproot) partilham o algoritmo; muda a constante final. */
function bech32Ok(addr: string): boolean {
  // Maiusculas e minusculas misturadas sao invalidas por norma (BIP-173).
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return false;
  const a = addr.toLowerCase();
  const sep = a.lastIndexOf("1");
  if (sep < 1) return false;
  const hrp = a.slice(0, sep);
  if (hrp !== "bc") return false;
  const data = a.slice(sep + 1);
  if (data.length < 6) return false;
  const values: number[] = [];
  for (const c of data) {
    const i = CHARSET.indexOf(c);
    if (i < 0) return false;
    values.push(i);
  }
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...values];
  for (const x of expanded) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ x;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
  }
  chk = chk >>> 0;
  return chk === 1 || chk === 0x2bc830a3;
}

/** true se o endereco passa o checksum da sua familia (mainnet). */
export function isValidBtcAddress(address: unknown): address is string {
  if (typeof address !== "string" || address.length < 26 || address.length > 90) return false;
  if (/^[13]/.test(address)) return base58CheckOk(address);
  if (/^bc1/i.test(address)) return bech32Ok(address);
  return false;
}
