import { NextResponse } from "next/server";

import { getPlanOrNull, planUnavailableResponse, requiresPlanResponse } from "@/lib/api/entitlement";
import { requireUser } from "@/lib/api/requireUser";
import { cifrar, cofreDisponivel, decifrar } from "@/lib/cex/cofre";
import { eExchange, lerSaldos, type CexBalance } from "@/lib/cex/leitores";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Contas de exchange guardadas no servidor (opção da pessoa). As chaves entram
// uma vez, são validadas contra a exchange, e ficam cifradas (ver cofre.ts).
// A partir daí o cron actualiza os saldos de meia em meia hora, com a app
// fechada; a página lê a última leitura daqui.
//
//   GET     lista (sem chaves) + saldos em cache
//   POST    guarda { exchange, label?, apiKey, apiSecret?, apiPassphrase? }
//   POST    ?refresh=<id>  lê agora e actualiza a cache
//   DELETE  ?id=<id>

type Linha = { id: string; exchange: string; label: string | null; balances: CexBalance[] | null; balances_at: string | null; last_error: string | null; created_at: string };

const semTabela = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message ?? ""));

async function guarda(request: Request, route: string) {
  const auth = await requireUser(request, { route, limit: 30 });
  if (!auth.ok) return { erro: auth.response } as const;
  const plan = await getPlanOrNull(auth.userId);
  if (!plan) return { erro: planUnavailableResponse() } as const;
  if (plan === "free") return { erro: requiresPlanResponse("pro") } as const;
  return { userId: auth.userId } as const;
}

export async function GET(request: Request) {
  const g = await guarda(request, "cex-keys");
  if ("erro" in g) return g.erro;
  if (!cofreDisponivel()) return NextResponse.json({ enabled: false, accounts: [] });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("cex_keys").select("id, exchange, label, balances, balances_at, last_error, created_at").eq("user_id", g.userId).order("created_at");
  if (error) {
    if (semTabela(error)) return NextResponse.json({ enabled: false, accounts: [], reason: "table_missing" });
    return NextResponse.json({ error: "list_failed" }, { status: 503 });
  }
  // Com a app aberta, o GET faz o trabalho do cron: o que tiver mais de 30
  // minutos é relido agora (até 5 contas por pedido, para caber no tempo).
  // O cron diário cobre a app fechada — o plano Hobby da Vercel não dá mais.
  const contas = (data ?? []) as Array<Linha & { enc?: string }>;
  const limite = Date.now() - 30 * 60_000;
  const antigas = contas.filter((c) => !c.balances_at || new Date(c.balances_at).getTime() < limite).slice(0, 5);
  if (antigas.length > 0) {
    const { data: comEnc } = await admin.from("cex_keys").select("id, exchange, enc").in("id", antigas.map((c) => c.id));
    await Promise.all((comEnc ?? []).map(async (l) => {
      const agora = new Date().toISOString();
      const alvo = contas.find((c) => c.id === l.id);
      if (!alvo || !eExchange(l.exchange)) return;
      try {
        const chaves = decifrar(l.enc as string);
        const balances = await lerSaldos(l.exchange, chaves.apiKey, chaves.apiSecret, chaves.apiPassphrase);
        await admin.from("cex_keys").update({ balances, balances_at: agora, last_error: null, updated_at: agora }).eq("id", l.id);
        alvo.balances = balances; alvo.balances_at = agora; alvo.last_error = null;
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "erro";
        await admin.from("cex_keys").update({ last_error: msg, updated_at: agora }).eq("id", l.id);
        alvo.last_error = msg;
      }
    }));
  }
  return NextResponse.json({ enabled: true, accounts: contas.map((c) => { const copia = { ...c }; delete copia.enc; return copia; }) });
}

export async function POST(request: Request) {
  const g = await guarda(request, "cex-keys");
  if ("erro" in g) return g.erro;
  if (!cofreDisponivel()) return NextResponse.json({ error: "server_storage_disabled" }, { status: 503 });
  const admin = getSupabaseAdmin();
  const refreshId = new URL(request.url).searchParams.get("refresh");

  if (refreshId) {
    const { data, error } = await admin.from("cex_keys").select("id, exchange, enc").eq("id", refreshId).eq("user_id", g.userId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!eExchange(data.exchange)) return NextResponse.json({ error: "Unknown exchange" }, { status: 400 });
    try {
      const chaves = decifrar(data.enc as string);
      const balances = await lerSaldos(data.exchange, chaves.apiKey, chaves.apiSecret, chaves.apiPassphrase);
      const agora = new Date().toISOString();
      await admin.from("cex_keys").update({ balances, balances_at: agora, last_error: null, updated_at: agora }).eq("id", data.id);
      return NextResponse.json({ id: data.id, balances, balances_at: agora });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await admin.from("cex_keys").update({ last_error: msg, updated_at: new Date().toISOString() }).eq("id", data.id);
      return NextResponse.json({ id: data.id, error: msg }, { status: 502 });
    }
  }

  const body = (await request.json().catch(() => null)) as { exchange?: string; label?: string; apiKey?: string; apiSecret?: string; apiPassphrase?: string } | null;
  if (!body?.exchange || !body.apiKey || !eExchange(body.exchange)) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  // Valida-se contra a exchange ANTES de guardar: uma chave que não lê não se guarda.
  let balances: CexBalance[];
  try {
    balances = await lerSaldos(body.exchange, body.apiKey, body.apiSecret, body.apiPassphrase);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 502 });
  }
  const enc = cifrar({ apiKey: body.apiKey, apiSecret: body.apiSecret, apiPassphrase: body.apiPassphrase });
  const agora = new Date().toISOString();
  const { data, error } = await admin.from("cex_keys")
    .insert({ user_id: g.userId, exchange: body.exchange, label: body.label?.slice(0, 60) || null, enc, balances, balances_at: agora })
    .select("id, exchange, label, balances, balances_at, last_error, created_at").single();
  if (error) {
    if (semTabela(error)) return NextResponse.json({ error: "server_storage_disabled" }, { status: 503 });
    return NextResponse.json({ error: "save_failed" }, { status: 503 });
  }
  return NextResponse.json({ account: data as Linha });
}

export async function DELETE(request: Request) {
  const g = await guarda(request, "cex-keys");
  if ("erro" in g) return g.erro;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("cex_keys").delete().eq("id", id).eq("user_id", g.userId);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 503 });
  return NextResponse.json({ ok: true });
}
