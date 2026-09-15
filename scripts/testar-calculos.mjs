#!/usr/bin/env node
// Testes dos calculos que decidem dinheiro: FIFO com taxas e CSV de trades.
// Sem framework de testes: transpila o TypeScript com o sucrase (ja vem nas
// dependencias), resolve o alias "@/" e corre cada ficheiro scripts/testes/*.test.ts.
//   node scripts/testar-calculos.mjs
// Sai com codigo 1 se algum teste falhar — corre no CI (npm run verificar).
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { transform } = require("sucrase");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "cfa-testes-"));
const feitos = new Set();

// Transpila um ficheiro e, recursivamente, os imports locais ("@/…" e "./…").
function compilar(abs) {
  if (feitos.has(abs)) return;
  feitos.add(abs);
  let code = readFileSync(abs, "utf8");
  const deps = [];
  code = code.replace(/from\s+"(@\/[^"]+|\.{1,2}\/[^"]+)"/g, (m, spec) => {
    const alvo = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : resolve(dirname(abs), spec);
    const ficheiro = [alvo + ".ts", alvo + ".tsx", join(alvo, "index.ts")].find((f) => { try { readFileSync(f); return true; } catch { return false; } });
    if (!ficheiro) return m;
    deps.push(ficheiro);
    const destinoDep = join(out, relative(root, ficheiro)).replace(/\.tsx?$/, ".js");
    const destinoEu = join(out, relative(root, abs)).replace(/\.tsx?$/, ".js");
    let rel = relative(dirname(destinoEu), destinoDep);
    if (!rel.startsWith(".")) rel = "./" + rel;
    return `from "${rel}"`;
  });
  const js = transform(code, { transforms: ["typescript", "imports"], filePath: abs }).code;
  const destino = join(out, relative(root, abs)).replace(/\.tsx?$/, ".js");
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, js);
  deps.forEach(compilar);
}

let falhas = 0;
for (const f of readdirSync(join(root, "scripts/testes")).filter((f) => f.endsWith(".test.ts"))) {
  const abs = join(root, "scripts/testes", f);
  compilar(abs);
  console.log(`\n── ${f}`);
  try {
    execFileSync(process.execPath, [join(out, relative(root, abs)).replace(/\.ts$/, ".js")], { stdio: "inherit" });
  } catch { falhas++; }
}
console.log(falhas === 0 ? "\n✅ Cálculos em ordem." : `\n❌ ${falhas} ficheiro(s) de teste com falhas.`);
process.exit(falhas ? 1 : 0);
