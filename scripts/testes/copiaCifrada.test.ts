// A cópia cifrada tem de se abrir com a ferramenta de restauro, só com a chave
// certa, e nunca pode sair em claro por causa de uma chave mal colada.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { cifrarCopia, EXTENSAO_CIFRADA } from "@/lib/backup/cifra";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

const par = () => generateKeyPairSync("rsa", { modulusLength: 2048 });
const { publicKey, privateKey } = par();
const publica = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const original = JSON.stringify({ dados: { "auth.users": [{ email: "pessoa@exemplo.com" }] } });
const gz = gzipSync(Buffer.from(original));
const cifrada = cifrarCopia(gz, publica);

ok("o conteúdo não fica legível", !cifrada.includes(Buffer.from("pessoa@exemplo.com")) && !cifrada.includes(gz.subarray(0, 32)));
ok("dois ficheiros iguais não dão o mesmo resultado", !cifrada.equals(cifrarCopia(gz, publica)));

let lancou = false;
try { cifrarCopia(gz, "nao-e-uma-chave"); } catch { lancou = true; }
ok("chave inválida lança em vez de seguir em claro", lancou);

const pasta = mkdtempSync(join(tmpdir(), "cfa-copia-"));
const correr = (...args: string[]) => {
  try { execFileSync(process.execPath, ["scripts/decifrar-copia.mjs", ...args], { stdio: "pipe" }); return true; } catch { return false; }
};
try {
  const entrada = join(pasta, `2026-11-07${EXTENSAO_CIFRADA}`);
  const chave = join(pasta, "privada.pem");
  writeFileSync(entrada, cifrada);
  writeFileSync(chave, privateKey.export({ format: "pem", type: "pkcs8" }));
  ok("a ferramenta abre com a chave certa", correr(entrada, chave));
  ok("devolve o conteúdo original", gunzipSync(readFileSync(join(pasta, "2026-11-07.json.gz"))).toString() === original);

  const outra = join(pasta, "outra.pem");
  writeFileSync(outra, par().privateKey.export({ format: "pem", type: "pkcs8" }));
  ok("a chave errada não abre", !correr(entrada, outra, join(pasta, "x")));

  const danificado = Buffer.from(cifrada);
  danificado[danificado.length - 1] ^= 1;
  const entradaMa = join(pasta, "danificado.cifrado");
  writeFileSync(entradaMa, danificado);
  ok("um ficheiro alterado não abre", !correr(entradaMa, chave, join(pasta, "y")));

  const velho = join(pasta, "velho.json.gz");
  writeFileSync(velho, gz);
  ok("uma cópia antiga em claro é recusada com aviso", !correr(velho, chave, join(pasta, "z")));
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
