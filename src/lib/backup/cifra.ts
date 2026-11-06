import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "crypto";

// Cifra das cópias de segurança (auditoria 6 nov 2026): a cópia leva os dados de
// todos os clientes e saía em claro para o email, para o espelho e para o balde.
//
// Cifra híbrida: cada ficheiro tem uma chave AES-256-GCM aleatória, embrulhada com
// uma chave PÚBLICA RSA. Na Vercel só está a pública, que serve para cifrar e não
// para decifrar: quem entrar na Vercel, no email ou no balde não abre as cópias. A
// privada fica fora da nuvem e abre-as com scripts/decifrar-copia.mjs. Perdê-la
// inutiliza todas as cópias cifradas: tem de estar guardada em dois sítios.
//
// Formato: "CFAB1\n" | tamanho da chave embrulhada (2 bytes) | chave embrulhada |
// iv (12) | etiqueta GCM (16) | conteúdo. O cabeçalho entra na autenticação.

export const EXTENSAO_CIFRADA = ".json.gz.cifrado";
const MAGIA = Buffer.from("CFAB1\n", "latin1");

/** `chavePublica`: a chave em DER (SPKI) e base64, numa só linha (BACKUP_PUBLIC_KEY). */
export function cifrarCopia(gz: Buffer, chavePublica: string): Buffer {
  let publica: ReturnType<typeof createPublicKey>;
  try {
    publica = createPublicKey({ key: Buffer.from(chavePublica.trim(), "base64"), format: "der", type: "spki" });
  } catch {
    // Sem recuo para "em claro": uma chave mal colada não pode tirar a cifra em
    // silêncio. A cópia falha e o cron avisa no Telegram.
    throw new Error("BACKUP_PUBLIC_KEY inválida");
  }
  const chave = randomBytes(32);
  const embrulhada = publicEncrypt({ key: publica, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, chave);
  const tamanho = Buffer.alloc(2);
  tamanho.writeUInt16BE(embrulhada.length);
  const cabecalho = Buffer.concat([MAGIA, tamanho, embrulhada]);
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  cifra.setAAD(cabecalho);
  const conteudo = Buffer.concat([cifra.update(gz), cifra.final()]);
  return Buffer.concat([cabecalho, iv, cifra.getAuthTag(), conteudo]);
}
