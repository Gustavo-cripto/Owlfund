import { NextResponse } from "next/server";
import { getPlanOrNull, planUnavailableResponse, requiresPlanResponse } from "@/lib/api/entitlement";
import { requireUser } from "@/lib/api/requireUser";
import { eExchange, lerSaldos, type CexBalance, type CexBalanceResponse } from "@/lib/cex/leitores";

export type { CexBalance, CexBalanceResponse };

// Frankfurt: a Binance devolve 451 aos servidores nos EUA (regiao por omissao da Vercel).
export const preferredRegion = "fra1";

// Os leitores por exchange vivem em src/lib/cex/leitores.ts, partilhados com o
// cron que actualiza as contas guardadas no servidor (src/app/api/cron/cex-refresh).
export async function POST(request: Request) {
  // Proxy com custo/quota nossa: so com sessao e limite por utilizador.
  const auth = await requireUser(request, { route: "cex-balance", limit: 20 });
  if (!auth.ok) return auth.response;
  // Vendido como exclusivo do plano Pro na tabela de precos. O bloqueio so
  // existia no ecra: um pedido direto a rota devolvia os dados a qualquer conta.
  const plan = await getPlanOrNull(auth.userId);
  if (!plan) return planUnavailableResponse();   // fail-closed se a BD cair
  if (plan === "free") return requiresPlanResponse("pro");
  const body = await request.json() as { exchange: string; apiKey: string; apiSecret?: string; apiPassphrase?: string };
  const { exchange, apiKey, apiSecret, apiPassphrase } = body;

  if (!exchange || !apiKey || (!apiSecret && exchange !== "bitpanda")) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!eExchange(exchange)) return NextResponse.json({ error: "Unknown exchange" }, { status: 400 });
  if (exchange === "okx" && !apiPassphrase) {
    return NextResponse.json({ error: "OKX precisa da passphrase da chave." }, { status: 400 });
  }

  try {
    const balances = await lerSaldos(exchange, apiKey, apiSecret, apiPassphrase);
    return NextResponse.json({ exchange, balances } satisfies CexBalanceResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ exchange, balances: [], error: msg } satisfies CexBalanceResponse, { status: 502 });
  }
}
