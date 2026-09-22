import { NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/cron-auth";
import { cofreDisponivel, decifrar } from "@/lib/cex/cofre";
import { eExchange, lerSaldos } from "@/lib/cex/leitores";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De meia em meia hora (ver vercel.json): lê os saldos de todas as contas de
// exchange guardadas no servidor e actualiza a cache. É o que dá "saldo
// actualizado com a app fechada". Cinco de cada vez, para não bater nas
// exchanges todas ao mesmo tempo; um erro numa conta fica registado nela e
// não trava as outras.
const LOTE = 5;

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cofreDisponivel()) return NextResponse.json({ skipped: "sem CEX_KEYS_SECRET" });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("cex_keys").select("id, exchange, enc").order("updated_at", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  let ok = 0, falhas = 0;
  const linhas = data ?? [];
  for (let i = 0; i < linhas.length; i += LOTE) {
    await Promise.all(linhas.slice(i, i + LOTE).map(async (l) => {
      const agora = new Date().toISOString();
      try {
        if (!eExchange(l.exchange)) throw new Error("exchange desconhecida");
        const chaves = decifrar(l.enc as string);
        const balances = await lerSaldos(l.exchange, chaves.apiKey, chaves.apiSecret, chaves.apiPassphrase);
        await admin.from("cex_keys").update({ balances, balances_at: agora, last_error: null, updated_at: agora }).eq("id", l.id);
        ok++;
      } catch (e) {
        falhas++;
        await admin.from("cex_keys").update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "erro", updated_at: agora }).eq("id", l.id);
      }
    }));
  }
  return NextResponse.json({ contas: linhas.length, ok, falhas });
}
