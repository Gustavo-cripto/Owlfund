// checkApiKey (API REST + MCP) com um cliente Supabase FALSO, sem rede
// (auditoria api-06/api-13, out 2026): o plano vem de entitlement.getPlan
// (ativa OU trialing, todas as linhas, Premium ganha) e uma falha da base de
// dados é "unavailable" (503), nunca "requer Premium" (403) nem "inválida".
//
// auth.ts importa next/server e @supabase/supabase-js, que o executor de testes
// não resolve (corre os ficheiros transpilados numa pasta temporária). Por isso
// esses dois módulos são substituídos por simulacros ANTES de carregar auth.ts.
import type { KeyCheck } from "@/lib/api/auth";
import { createRequire } from "node:module";
import crypto from "crypto";

const requerer = createRequire(__filename);
type Carregador = (pedido: string, pai: unknown, principal: boolean) => unknown;
const Mod = requerer("node:module") as { _load: Carregador };
const original = Mod._load;
Mod._load = function (pedido, pai, principal) {
  if (pedido === "next/server") {
    return { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200, headers: new Map() }) } };
  }
  if (pedido === "@supabase/supabase-js") return { createClient: () => { throw new Error("sem rede nos testes"); } };
  return original.call(this, pedido, pai, principal);
};
const { checkApiKey } = requerer("../../src/lib/api/auth.js") as { checkApiKey: (t: string, c?: unknown) => Promise<KeyCheck> };

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? ` — ${extra}` : ""}`); };

type Linha = Record<string, unknown>;
type Cenario = { keys?: Linha[]; subs?: Linha[]; erroEm?: "api_keys" | "subscriptions"; rpc?: boolean | "erro" };

const TOKEN = `cfa_live_${"a1".repeat(20)}`;
const HASH = crypto.createHash("sha256").update(TOKEN).digest("hex");
const USER = "u_1";
const CHAVE_ATIVA: Linha = { key_hash: HASH, user_id: USER, is_active: true };
const FUTURO = new Date(Date.now() + 30 * 86_400_000).toISOString();
const PASSADO = new Date(Date.now() - 86_400_000).toISOString();

/** Cliente com o subconjunto do PostgREST que checkApiKey e getPlan usam. */
function clienteFalso(c: Cenario) {
  const tabelas: Record<string, Linha[]> = { api_keys: c.keys ?? [CHAVE_ATIVA], subscriptions: c.subs ?? [] };
  return {
    from(tabela: string) {
      const filtros: Array<(r: Linha) => boolean> = [];
      const resultado = (um: boolean) => {
        if (c.erroEm === tabela) return { data: null, error: { message: "falha simulada" } };
        const linhas = (tabelas[tabela] ?? []).filter((r) => filtros.every((f) => f(r)));
        return { data: um ? linhas[0] ?? null : linhas, error: null };
      };
      const q = {
        select: () => q,
        update: () => q,
        eq: (col: string, v: unknown) => { filtros.push((r) => r[col] === v); return q; },
        in: (col: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[col])); return q; },
        // "current_period_end.is.null,current_period_end.gt.<agora>" — a regra de não expirada.
        or: (expr: string) => {
          const m = /current_period_end\.gt\.(.+)$/.exec(expr);
          if (m) filtros.push((r) => r.current_period_end == null || String(r.current_period_end) > m[1]);
          return q;
        },
        maybeSingle: () => Promise.resolve(resultado(true)),
        then: (ok2: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado(false)).then(ok2, ko),
      };
      return q;
    },
    rpc: () => Promise.resolve(c.rpc === "erro" ? { data: null, error: { message: "rpc em baixo" } } : { data: c.rpc ?? true, error: null }),
  };
}

const premium = (extra: Linha = {}): Linha => ({ user_id: USER, status: "active", price_id: "manual_premium", current_period_end: FUTURO, ...extra });
const pro = (extra: Linha = {}): Linha => ({ user_id: USER, status: "active", price_id: "price_pro_teste", current_period_end: FUTURO, ...extra });

(async () => {
  const caso = async (nome: string, c: Cenario, quer: KeyCheck) => {
    const r = await checkApiKey(TOKEN, clienteFalso(c));
    ok(nome, JSON.stringify(r) === JSON.stringify(quer), JSON.stringify(r));
  };

  await caso("Premium ativo → ok", { subs: [premium()] }, { ok: true, userId: USER });
  await caso("Premium em trialing conta como Premium", { subs: [premium({ status: "trialing" })] }, { ok: true, userId: USER });
  await caso("Pro com data mais tardia + Premium sem data → Premium ganha", {
    subs: [pro({ current_period_end: new Date(Date.now() + 300 * 86_400_000).toISOString() }), premium({ current_period_end: null })],
  }, { ok: true, userId: USER });
  await caso("só Pro → requer Premium", { subs: [pro()] }, { ok: false, reason: "premium" });
  await caso("sem subscrição → requer Premium", { subs: [] }, { ok: false, reason: "premium" });
  await caso("Premium expirado → requer Premium", { subs: [premium({ current_period_end: PASSADO })] }, { ok: false, reason: "premium" });
  await caso("Premium cancelado → requer Premium", { subs: [premium({ status: "canceled" })] }, { ok: false, reason: "premium" });
  await caso("erro da BD nas subscrições → unavailable (503), não 403", { subs: [premium()], erroEm: "subscriptions" }, { ok: false, reason: "unavailable" });
  await caso("erro da BD nas chaves → unavailable, não 'inválida'", { subs: [premium()], erroEm: "api_keys" }, { ok: false, reason: "unavailable" });
  await caso("chave revogada → invalid", { keys: [{ ...CHAVE_ATIVA, is_active: false }], subs: [premium()] }, { ok: false, reason: "invalid" });
  await caso("chave desconhecida → invalid", { keys: [], subs: [premium()] }, { ok: false, reason: "invalid" });
  await caso("contador de pedidos em baixo → unavailable", { subs: [premium()], rpc: "erro" }, { ok: false, reason: "unavailable" });
  await caso("contador cheio → rate_limited", { subs: [premium()], rpc: false }, { ok: false, reason: "rate_limited" });
  ok("formato errado → invalid sem tocar na BD", JSON.stringify(await checkApiKey("cfa_live_curta", clienteFalso({}))) === JSON.stringify({ ok: false, reason: "invalid" }));

  if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
  console.log("\nTODOS OK");
})();
