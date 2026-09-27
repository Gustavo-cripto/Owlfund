// Toda a variavel de ambiente lida no codigo (process.env.X) tem de estar
// documentada no .env.example — num projeto Vercel novo, o que nao esta la
// fica desligado em silencio (foi assim que 12 variaveis ficaram por
// documentar). Excecoes: variaveis da plataforma e exemplos de documentacao.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const EXCECOES = new Set([
  "NODE_ENV",    // Node/Next
  "VERCEL_URL",  // a Vercel define-a
  "CFA_KEY",     // exemplo nos docs da API (nao e lida pelo servidor)
]);

// Raiz do repositorio: onde estiverem o .env.example e a pasta src.
let root = process.cwd();
for (let i = 0; i < 5 && !(existsSync(join(root, ".env.example")) && existsSync(join(root, "src"))); i++) root = resolve(root, "..");

function ficheiros(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(nome)) out.push(p);
  }
  return out;
}

const noCodigo = new Set<string>();
for (const f of ficheiros(join(root, "src"))) {
  for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) noCodigo.add(m[1]);
}
const noExemplo = new Set<string>();
for (const m of readFileSync(join(root, ".env.example"), "utf8").matchAll(/^#? ?([A-Z0-9_]+)=/gm)) noExemplo.add(m[1]);

const emFalta = [...noCodigo].filter((v) => !noExemplo.has(v) && !EXCECOES.has(v)).sort();
console.log(`${noCodigo.size} variaveis no codigo, ${noExemplo.size} no .env.example`);
if (emFalta.length === 0) {
  console.log("✅ todas as variaveis do codigo estao documentadas no .env.example");
} else {
  console.log(`❌ em falta no .env.example: ${emFalta.join(", ")}`);
}
console.log(emFalta.length === 0 ? "\nTODOS OK" : `\n${emFalta.length} FALHA(S)`);
process.exit(emFalta.length ? 1 : 0);
