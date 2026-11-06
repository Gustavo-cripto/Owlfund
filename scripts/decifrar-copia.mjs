#!/usr/bin/env node
// Abre uma cópia de segurança cifrada (ver src/lib/backup/cifra.ts).
//
//   node scripts/decifrar-copia.mjs <copia.json.gz.cifrado> <chave-privada.pem> [saida.json.gz]
//
// Sem [saida] grava ao lado, sem o ".cifrado". Só usa o Node, sem dependências.
import { createDecipheriv, createPrivateKey, constants, privateDecrypt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [entrada, chaveFicheiro, saidaPedida] = process.argv.slice(2);
if (!entrada || !chaveFicheiro) {
  console.error("Uso: node scripts/decifrar-copia.mjs <copia.json.gz.cifrado> <chave-privada.pem> [saida.json.gz]");
  process.exit(2);
}

const MAGIA = Buffer.from("CFAB1\n", "latin1");
const b = readFileSync(entrada);
if (!b.subarray(0, MAGIA.length).equals(MAGIA)) {
  console.error("Este ficheiro não é uma cópia cifrada (cópias antigas, em .json.gz, abrem-se com gunzip).");
  process.exit(1);
}

try {
  const tamanho = b.readUInt16BE(MAGIA.length);
  const fimCabecalho = MAGIA.length + 2 + tamanho;
  const embrulhada = b.subarray(MAGIA.length + 2, fimCabecalho);
  const iv = b.subarray(fimCabecalho, fimCabecalho + 12);
  const etiqueta = b.subarray(fimCabecalho + 12, fimCabecalho + 28);
  const conteudo = b.subarray(fimCabecalho + 28);
  const privada = createPrivateKey(readFileSync(chaveFicheiro));
  const chave = privateDecrypt({ key: privada, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, embrulhada);
  const decifra = createDecipheriv("aes-256-gcm", chave, iv);
  decifra.setAAD(b.subarray(0, fimCabecalho));
  decifra.setAuthTag(etiqueta);
  const gz = Buffer.concat([decifra.update(conteudo), decifra.final()]);
  const saida = saidaPedida ?? entrada.replace(/\.cifrado$/, "");
  writeFileSync(saida, gz, { mode: 0o600 });
  console.log(`Decifrada: ${saida}`);
} catch {
  console.error("Não foi possível decifrar: a chave privada não é a certa, ou o ficheiro está danificado.");
  process.exit(1);
}
