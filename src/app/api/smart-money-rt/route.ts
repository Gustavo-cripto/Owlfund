import { NextRequest, NextResponse } from "next/server";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";
import { getPlanOrNull, planUnavailableResponse } from "@/lib/api/entitlement";
import { requireUser } from "@/lib/api/requireUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Era a unica rota em runtime "edge": nada aqui o exigia e impedia o limite por
// utilizador em memoria que as outras rotas usam.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cada chamada dispara ate 10 pedidos a Alchemy/Helius/mempool (quota
// partilhada por TODOS os utilizadores). Mesmo padrao de /api/whale-txs: limite
// por minuto (requireUser, que aceita cookie e Bearer — a app movel continua a
// funcionar) mais teto diario por conta, atomico na base de dados. A app movel
// actualiza de 60 em 60 s: 1 440/dia fica bem abaixo do teto.
const TETO_DIARIO = 3000;

export async function GET(req: NextRequest) {
  const guard = await requireUser(req, { route: "smart-money-rt", limit: 30 });
  if (!guard.ok) return guard.response;

  const plano = await getPlanOrNull(guard.userId);
  if (!plano) return planUnavailableResponse();
  if (plano !== "premium") return NextResponse.json({ error: "Requer Premium.", code: "requires_premium" }, { status: 403 });

  try {
    const { data: dentro, error: rlErr } = await getSupabaseAdmin().rpc("api_rate_check", {
      p_key_hash: `smart-money-rt:${guard.userId}`,
      p_limit: TETO_DIARIO,
      p_window_seconds: 86400,
    });
    if (rlErr) throw new Error(rlErr.message);
    if (dentro === false) {
      return NextResponse.json(
        { error: "Limite diario de consultas atingido. Tenta amanha.", code: "daily_limit" },
        { status: 429 },
      );
    }
  } catch (e) {
    console.error("[smart-money-rt] teto diario indisponivel (fail-closed):", e instanceof Error ? e.message : e);
    return planUnavailableResponse();
  }

  const watchlistParam = req.nextUrl.searchParams.get("watchlist");
  let watchlist: WatchEntry[] = [];
  try {
    watchlist = watchlistParam ? (JSON.parse(watchlistParam) as WatchEntry[]) : [];
  } catch { watchlist = []; }

  const { movements, scanned } = await scanWatchlist(watchlist);
  return NextResponse.json({ movements, scanned, timestamp: Date.now() });
}
