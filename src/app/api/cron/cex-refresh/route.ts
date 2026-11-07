import { cronVigiado } from "@/lib/cron/cronVigiado";
import { NextResponse } from "next/server";

import { verifyCronAuth } from "@/lib/api/cron-auth";
import { cofreDisponivel, decifrar } from "@/lib/cex/cofre";
import { eExchange, lerSaldos } from "@/lib/cex/leitores";
import { falhaDaCexRefresh } from "@/lib/cron/vigia";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // plano Pro (nov 2026): antes 60 s, o limite do Hobby

// De duas em duas horas (ver vercel.json; no plano Hobby era uma vez por dia,
// o único ritmo que ele permitia — desde nov 2026 o site está no Pro). Lê os saldos de todas as
// contas de exchange guardadas no servidor e actualiza a cache: é o que dá
// "saldo actualizado com a app fechada". Com a app aberta, é o próprio GET de
// /api/cex-keys que actualiza o que tiver mais de 30 minutos. Cinco de cada
// vez, para não bater nas exchanges todas ao mesmo tempo; um erro numa conta
// fica registado nela e não trava as outras.
const LOTE = 5;

async function executar(request: Request) {
  if (!(await verifyCronAuth(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!cofreDisponivel()) return NextResponse.json({ error: "sem CEX_KEYS_SECRET" }, { status: 503 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("cex_keys").select("id, exchange, enc").order("updated_at", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });

  let ok = 0, erroExchange = 0, erroSistema = 0;
  const linhas = data ?? [];
  for (let i = 0; i < linhas.length; i += LOTE) {
    await Promise.all(linhas.slice(i, i + LOTE).map(async (l) => {
      const agora = new Date().toISOString();
      // O cofre à parte: não decifrar é um problema nosso (segredo mudado), não da exchange.
      let chaves: ReturnType<typeof decifrar>;
      try {
        chaves = decifrar(l.enc as string);
      } catch (e) {
        erroSistema++;
        await admin.from("cex_keys").update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "erro", updated_at: agora }).eq("id", l.id);
        return;
      }
      try {
        if (!eExchange(l.exchange)) throw new Error("exchange desconhecida");
        const balances = await lerSaldos(l.exchange, chaves.apiKey, chaves.apiSecret, chaves.apiPassphrase);
        const { error: gravar } = await admin.from("cex_keys").update({ balances, balances_at: agora, last_error: null, updated_at: agora }).eq("id", l.id);
        if (gravar) erroSistema++; else ok++;
      } catch (e) {
        erroExchange++;
        const { error: gravar } = await admin.from("cex_keys").update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "erro", updated_at: agora }).eq("id", l.id);
        if (gravar) erroSistema++;
      }
    }));
  }
  const contagem = { contas: linhas.length, ok, erroExchange, erroSistema };
  const aviso = falhaDaCexRefresh(contagem);
  if (aviso) return NextResponse.json({ ...contagem, aviso }, { status: 500 });
  return NextResponse.json(contagem);
}

export const GET = cronVigiado("cex-refresh", executar);
