// O travão das contas novas: por IP, global, e sem nunca impedir de entrar.
import { primeiroAvisoDoDia, travaoDeContas } from "@/lib/beta/travaoContas";
import type { SupabaseClient } from "@supabase/supabase-js";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

function falso(falha = false) {
  const contas = new Map<string, number>();
  return {
    contas,
    rpc: async (_: string, a: { p_key_hash: string; p_limit: number }) => {
      if (falha) return { data: null, error: { message: "sem base de dados" } };
      const n = (contas.get(a.p_key_hash) ?? 0) + 1;
      contas.set(a.p_key_hash, n);
      return { data: n <= a.p_limit, error: null };
    },
  } as unknown as SupabaseClient & { contas: Map<string, number> };
}

async function main() {
  const a = falso();
  let r = "";
  for (let i = 0; i < 10; i++) r = await travaoDeContas(a, "1.1.1.1");
  ok("as 10 primeiras do mesmo IP passam", r === "ok");
  ok("a 11.ª do mesmo IP para", (await travaoDeContas(a, "1.1.1.1")) === "ip");
  ok("outro IP continua a passar", (await travaoDeContas(a, "2.2.2.2")) === "ok");

    const b = falso();
  for (let i = 0; i < 100; i++) await travaoDeContas(b, `10.0.0.${i}`);
  ok("a 101.ª do dia para, mesmo de um IP novo", (await travaoDeContas(b, "9.9.9.9")) === "global");

  const c = falso();
  for (let i = 0; i < 50; i++) await travaoDeContas(c, "3.3.3.3");
  ok("quem passou o teto do IP não gasta o global", (await travaoDeContas(c, "4.4.4.4")) === "ok" && [...c.contas.values()].every((n) => n <= 50));
  ok("sem IP só conta o global", (await travaoDeContas(falso(), "unknown")) === "ok" && (await travaoDeContas(falso(), null)) === "ok");

  ok("sem base de dados deixa passar", (await travaoDeContas(falso(true), "1.1.1.1")) === "ok");

  const d = falso();
  ok("o primeiro aviso do dia sai", (await primeiroAvisoDoDia(d, "ip")) === true);
  ok("o segundo não", (await primeiroAvisoDoDia(d, "ip")) === false);
  ok("um motivo diferente tem o seu aviso", (await primeiroAvisoDoDia(d, "global")) === true);
  ok("sem base de dados não avisa", (await primeiroAvisoDoDia(falso(true), "ip")) === false);

  if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
  console.log("TODOS OK");
}

void main();
