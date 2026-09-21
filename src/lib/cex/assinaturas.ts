// Assinaturas das exchanges novas (setembro de 2026), separadas da rota para
// se poderem testar sem rede. Cada uma segue a documentação oficial ou os
// exemplos publicados pela própria exchange — a fonte está em cada função.
import crypto from "crypto";

/** Bitvavo — docs.bitvavo.com: HMAC-SHA256(secret, timestamp + método + caminho + corpo), em hex. */
export function assinarBitvavo(secret: string, timestampMs: number, metodo: string, caminho: string, corpo = ""): string {
  return crypto.createHmac("sha256", secret).update(`${timestampMs}${metodo}${caminho}${corpo}`).digest("hex");
}

/**
 * Bitstamp v2 — bitstamp.net/api: a string a assinar é a concatenação, SEM
 * separadores, de "BITSTAMP <key>", método, host, caminho, query, content-type
 * (vazio sem corpo), nonce (uuid v4), timestamp em ms, "v2" e o corpo.
 */
export function stringBitstamp(apiKey: string, metodo: string, caminho: string, nonce: string, timestampMs: number, query = "", contentType = "", corpo = ""): string {
  return `BITSTAMP ${apiKey}${metodo}www.bitstamp.net${caminho}${query}${contentType}${nonce}${timestampMs}v2${corpo}`;
}
export function assinarBitstamp(secret: string, mensagem: string): string {
  return crypto.createHmac("sha256", secret).update(mensagem, "utf8").digest("hex");
}

/**
 * Bit2Me — github.com/bit2me-devs/trading-spot-samples (node/auth/rest.js):
 * mensagem "nonce:caminho[:corpo]", SHA-256 em binário, e HMAC-SHA512 desse
 * digest com o secret, em base64.
 */
export function assinarBit2Me(secret: string, nonceMs: number, caminho: string, corpo?: string): string {
  const mensagem = corpo ? `${nonceMs}:${caminho}:${corpo}` : `${nonceMs}:${caminho}`;
  const digest = crypto.createHash("sha256").update(mensagem).digest();
  return crypto.createHmac("sha512", secret).update(digest).digest("base64");
}

/** Nexo Pro — pro.nexo.io/api-doc-pro: HMAC-SHA256(secret, nonce) em base64. */
export function assinarNexoPro(secret: string, nonceMs: number): string {
  return crypto.createHmac("sha256", secret).update(String(nonceMs)).digest("base64");
}

/**
 * Revolut X — developer.revolut.com/docs/x-api: Ed25519 sobre
 * timestamp + método + caminho (a partir de /api) + query + corpo, em base64.
 * A chave privada pode vir em PEM (PKCS#8) ou como semente de 32 bytes em base64.
 */
export function assinarRevolutX(chavePrivada: string, timestampMs: number, metodo: string, caminho: string, query = "", corpo = ""): string {
  const mensagem = `${timestampMs}${metodo}${caminho}${query}${corpo}`;
  const key = chaveEd25519(chavePrivada);
  return crypto.sign(null, Buffer.from(mensagem, "utf8"), key).toString("base64");
}

function chaveEd25519(entrada: string): crypto.KeyObject {
  const s = entrada.trim();
  if (s.includes("-----BEGIN")) return crypto.createPrivateKey({ key: s, format: "pem" });
  const bytes = Buffer.from(s.replace(/\s+/g, ""), "base64");
  // Semente de 32 bytes (ou 64 = semente + chave pública): embrulha-se em PKCS#8.
  const semente = bytes.length >= 32 ? bytes.subarray(0, 32) : null;
  if (!semente) throw new Error("Revolut X: chave privada Ed25519 inválida (PEM ou base64 de 32 bytes).");
  const prefixo = Buffer.from("302e020100300506032b657004220420", "hex");
  return crypto.createPrivateKey({ key: Buffer.concat([prefixo, semente]), format: "der", type: "pkcs8" });
}
