// Cofre das chaves de exchange guardadas no servidor.
//
// PORQUÊ: as chaves ficam no browser por omissão, e assim só actualizamos com
// a app aberta. Quem quiser saldos actualizados com a app fechada (e, mais
// tarde, alertas) pode escolher guardá-las no servidor. Ficam cifradas com
// AES-256-GCM e uma chave que só existe na Vercel (CEX_KEYS_SECRET); a base de
// dados guarda o cifrado, nunca o valor. Sem a variável, a opção não existe.
//
// A chave de cifra: 32 bytes, em base64 ou hex. Gerar com
//   openssl rand -base64 32
import crypto from "crypto";

export type ChavesExchange = { apiKey: string; apiSecret?: string; apiPassphrase?: string };

function chaveDeCifra(): Buffer | null {
  const raw = process.env.CEX_KEYS_SECRET?.trim();
  if (!raw) return null;
  const b = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return b.length === 32 ? b : null;
}

export const cofreDisponivel = (): boolean => chaveDeCifra() !== null;

export function cifrar(chaves: ChavesExchange): string {
  const k = chaveDeCifra();
  if (!k) throw new Error("Cofre sem chave (CEX_KEYS_SECRET).");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const texto = Buffer.concat([c.update(JSON.stringify(chaves), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, texto]).toString("base64");
}

export function decifrar(blob: string): ChavesExchange {
  const k = chaveDeCifra();
  if (!k) throw new Error("Cofre sem chave (CEX_KEYS_SECRET).");
  const b = Buffer.from(blob, "base64");
  const iv = b.subarray(0, 12); const tag = b.subarray(12, 28); const texto = b.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  const claro = Buffer.concat([d.update(texto), d.final()]).toString("utf8");
  return JSON.parse(claro) as ChavesExchange;
}
