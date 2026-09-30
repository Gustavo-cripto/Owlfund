import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";

export const dynamic = "force-dynamic";

// Precos USD para uma lista de simbolos: OKX (principal) e CoinEx (reserva), sem chaves.
export async function GET(request: Request) {
  // Proxy com custo/quota nossa: so com sessao, e com limite por utilizador.
  const auth = await requireUser(request, { route: "token-prices", limit: 60 });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  const prices: Record<string, number> = { USDT: 1, USDC: 1, BUSD: 1, DAI: 1 };

  try {
    const emFalta = symbols.filter((s) => !prices[s]);
    if (emFalta.length) {
      // OKX primeiro (30 set 2026): a CoinEx deixou de reconhecer os mercados
      // "SYMBOLUSDT" no ticker por parametro. Um pedido com todos os pares SPOT.
      const okx = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000), next: { revalidate: 30 },
      }).catch(() => null);
      if (okx?.ok) {
        const j = (await okx.json().catch(() => null)) as { code?: string; data?: Array<{ instId?: string; last?: string }> } | null;
        const porPar = new Map((j?.code === "0" ? j.data ?? [] : []).map((r) => [r.instId ?? "", r.last ?? ""]));
        for (const s of emFalta) {
          const price = parseFloat(porPar.get(`${s}-USDT`) ?? "");
          if (Number.isFinite(price) && price > 0) prices[s] = price;
        }
      }
      // CoinEx so para o que a OKX nao tiver.
      // So simbolos "limpos" vao para a URL; com um par desconhecido a CoinEx
      // responde {"code":3639,"data":{}} (objeto, nao lista) — tratado abaixo.
      const markets = emFalta.filter((s) => !prices[s] && /^[A-Z0-9]{1,15}$/.test(s)).map((s) => `${s}USDT`).join(",");
      if (markets) {
        const res = await fetch(`https://api.coinex.com/v2/spot/ticker?market=${encodeURIComponent(markets)}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
        if (res?.ok) {
          const data = (await res.json().catch(() => null)) as { data?: unknown } | null;
          const lista = Array.isArray(data?.data) ? (data.data as Array<{ market?: string; last?: string }>) : [];
          lista.forEach((t) => {
            const sym = (t.market ?? "").replace(/_INDEX$/, "").replace(/USDT$/, "");
            const price = parseFloat(t.last ?? "");
            if (sym && Number.isFinite(price) && price > 0) prices[sym] = price;
          });
        }
      }
    }
  } catch {
    // return whatever we have
  }

  return NextResponse.json({ prices }, {
    headers: { "Cache-Control": "private, s-maxage=60, stale-while-revalidate=120" },
  });
}
