import crypto from "crypto";
import { assinarBit2Me, assinarBitvavo, assinarNexoPro, assinarRevolutX, stringBitstamp } from "@/lib/cex/assinaturas";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };
// Bitstamp: a string tem a ordem exata da documentacao, sem separadores
const sb = stringBitstamp("KEY", "POST", "/api/v2/account_balances/", "nonce-uuid", 1700000000000);
ok("bitstamp: string a assinar", sb === "BITSTAMP KEYPOSTwww.bitstamp.net/api/v2/account_balances/nonce-uuid1700000000000v2", sb);
// Bitvavo: HMAC-SHA256 hex de ts+metodo+caminho
const bv = assinarBitvavo("s", 1700000000000, "GET", "/v2/balance");
ok("bitvavo: hex de 64", /^[0-9a-f]{64}$/.test(bv) && bv === crypto.createHmac("sha256","s").update("1700000000000GET/v2/balance").digest("hex"));
// Bit2Me: sha256 -> hmac-sha512 base64 (igual ao exemplo oficial em node)
const esperado = crypto.createHmac("sha512","seg").update(crypto.createHash("sha256").update("1700000000000:/v1/trading/wallet/balance").digest()).digest("base64");
ok("bit2me: igual ao exemplo oficial", assinarBit2Me("seg", 1700000000000, "/v1/trading/wallet/balance") === esperado);
// Nexo Pro: HMAC-SHA256(secret, nonce) base64
ok("nexo pro", assinarNexoPro("seg", 1700000000000) === crypto.createHmac("sha256","seg").update("1700000000000").digest("base64"));
// Revolut X: Ed25519 — semente base64 e PEM dao a mesma assinatura, e verifica com a publica
const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
const der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
const semente = der.subarray(der.length - 32).toString("base64");
const s1 = assinarRevolutX(pem, 1700000000000, "GET", "/api/1.0/balances");
const s2 = assinarRevolutX(semente, 1700000000000, "GET", "/api/1.0/balances");
ok("revolut x: PEM e semente base64 assinam igual", s1 === s2);
ok("revolut x: assinatura verifica com a chave publica", crypto.verify(null, Buffer.from("1700000000000GET/api/1.0/balances"), publicKey, Buffer.from(s1, "base64")));
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
