// O vigia dos crons: quando regista, quando avisa, quem está atrasado, e a ligação
// entre o vercel.json, as rotas e a tabela de idades máximas.
import { readFileSync } from "fs";
import { criarVigia, cronsAtrasados, falhaDaCexRefresh, IDADE_MAXIMA_MS, type DepsVigia } from "@/lib/cron/vigia";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

function falsos(opts: { pode?: boolean; registoRebenta?: boolean; avisoRebenta?: boolean } = {}) {
  const registos: Array<[string, boolean, string | null]> = [];
  const avisos: Array<[string, string]> = [];
  const deps: DepsVigia = {
    registar: async (n, o, d) => { if (opts.registoRebenta) throw new Error("sem tabela"); registos.push([n, o, d]); },
    podeAvisar: async () => opts.pode ?? true,
    avisar: async (n, d) => { if (opts.avisoRebenta) throw new Error("telegram"); avisos.push([n, d]); },
  };
  return { deps, registos, avisos };
}

async function main() {
  {
    const f = falsos();
    const r = await criarVigia(f.deps)("x", async () => Response.json({ ok: true }))();
    ok("200 regista como correu bem, sem aviso", r.status === 200 && f.registos[0][1] === true && f.avisos.length === 0);
  }
  {
    const f = falsos();
    const r = await criarVigia(f.deps)("x", async () => Response.json({ aviso: "partiu" }, { status: 500 }))();
    ok("500 regista a falha e avisa com o motivo", r.status === 500 && f.registos[0][1] === false && f.avisos[0][1] === "partiu");
    ok("o corpo da resposta continua legível", (await r.json()).aviso === "partiu");
  }
  {
    const f = falsos({ pode: false });
    await criarVigia(f.deps)("x", async () => new Response(null, { status: 503 }))();
    ok("já avisou hoje: regista e não repete o aviso", f.registos.length === 1 && f.avisos.length === 0);
  }
  {
    const f = falsos();
    await criarVigia(f.deps)("x", async () => new Response(null, { status: 401 }))();
    await criarVigia(f.deps)("x", async () => new Response(null, { status: 429 }))();
    ok("401 e 429 não contam: o cron não correu", f.registos.length === 0 && f.avisos.length === 0);
  }
  {
    const f = falsos();
    await criarVigia(f.deps)("x", async () => new Response(null, { status: 500 }), { avisa: false })();
    ok("avisa:false não duplica o aviso que o cron já dá", f.registos.length === 1 && f.avisos.length === 0);
    const r = await criarVigia(f.deps)("x", async () => { throw new Error("rebentou"); }, { avisa: false })();
    ok("uma exceção avisa sempre e vira 500", r.status === 500 && f.avisos[0][1] === "rebentou");
  }
  {
    const f = falsos({ registoRebenta: true, avisoRebenta: true });
    const r1 = await criarVigia(f.deps)("x", async () => Response.json({ ok: true }))();
    const r2 = await criarVigia(f.deps)("x", async () => new Response(null, { status: 500 }))();
    ok("sem tabela e sem Telegram, a resposta do cron não muda", r1.status === 200 && r2.status === 500);
  }

  // ── Atrasados ─────────────────────────────────────────────────────────────
  const agora = Date.parse("2026-11-07T12:00:00Z");
  const ha = (h: number) => new Date(agora - h * 3_600_000).toISOString();
  const todos = (idade: number) => Object.keys(IDADE_MAXIMA_MS).map((cron) => ({ cron, ultimo_ok_em: ha(idade), criado_em: ha(1000) }));
  ok("tudo recente: ninguém atrasado", cronsAtrasados(todos(1), agora).length === 0);
  ok("whale-alerts com 4 h está atrasada, mas o snapshot com 4 h não", (() => {
    const a = cronsAtrasados(todos(4), agora);
    return a.includes("whale-alerts") && !a.includes("snapshot");
  })());
  ok("o semanal aguenta 7 dias", !cronsAtrasados(todos(7 * 24), agora).includes("resumo-semanal"));
  ok("cron que nunca registou, com registo recente: ainda não conta",
    !cronsAtrasados([{ cron: "snapshot", ultimo_ok_em: ha(1), criado_em: ha(1) }], agora).includes("cleanup"));
  ok("cron que nunca registou, com registo antigo: conta como atrasado",
    cronsAtrasados([{ cron: "snapshot", ultimo_ok_em: ha(1), criado_em: ha(30) }], agora).includes("cleanup"));
  ok("cron que só falhou (sem ok) conta desde o início do registo",
    cronsAtrasados([{ cron: "cleanup", ultimo_ok_em: null, criado_em: ha(30) }], agora).includes("cleanup"));

  // ── cex-refresh ───────────────────────────────────────────────────────────
  ok("uma chave revogada sozinha não é falha do cron", falhaDaCexRefresh({ contas: 1, ok: 0, erroExchange: 1, erroSistema: 0 }) === null);
  ok("duas chaves revogadas também não", falhaDaCexRefresh({ contas: 2, ok: 0, erroExchange: 2, erroSistema: 0 }) === null);
  ok("cofre que não decifra é falha, mesmo numa conta", falhaDaCexRefresh({ contas: 1, ok: 0, erroExchange: 0, erroSistema: 1 }) !== null);
  ok("3 contas e todas falharam é falha", falhaDaCexRefresh({ contas: 3, ok: 0, erroExchange: 3, erroSistema: 0 }) !== null);
  ok("3 contas e uma correu bem não é", falhaDaCexRefresh({ contas: 3, ok: 1, erroExchange: 2, erroSistema: 0 }) === null);
  ok("sem contas não há falha", falhaDaCexRefresh({ contas: 0, ok: 0, erroExchange: 0, erroSistema: 0 }) === null);

  // ── vercel.json, rotas e tabela de idades ─────────────────────────────────
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as Array<{ path: string }>).map((c) => c.path.replace("/api/cron/", ""));
  ok("cada cron do vercel.json tem idade máxima", crons.every((c) => c in IDADE_MAXIMA_MS), crons.filter((c) => !(c in IDADE_MAXIMA_MS)).join(","));
  ok("a tabela não tem crons a mais", Object.keys(IDADE_MAXIMA_MS).every((c) => crons.includes(c)));
  const semVigia = crons.filter((c) => !readFileSync(`src/app/api/cron/${c}/route.ts`, "utf8").includes(`cronVigiado("${c}"`));
  ok("cada rota de cron passa pelo vigia, com o seu nome", semVigia.length === 0, semVigia.join(","));

  // ── A CSP não pode voltar a perder o socket das liquidações ───────────────
  ok("CSP deixa abrir o socket das liquidações", readFileSync("next.config.js", "utf8").includes('"wss://fstream.binance.com"'));
  ok("o middleware não corre no batimento do Mac", /api\/\(\?:[^)]*\bbots\b/.test(readFileSync("src/middleware.ts", "utf8")));

  if (fails) { console.error(`\n${fails} teste(s) do vigia dos crons falharam`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
