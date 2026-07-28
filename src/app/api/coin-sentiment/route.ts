import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Sentimento da comunidade (votos bullish/bearish) de um ativo, via CoinGecko.
// Grátis, sem chave. Chamado quando o utilizador seleciona um ativo no Mercado.
export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").replace(/[^a-z0-9-]/gi, "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return NextResponse.json({ up: null, down: null });
    const j = (await res.json()) as {
      sentiment_votes_up_percentage?: number | null;
      sentiment_votes_down_percentage?: number | null;
    };
    return NextResponse.json({
      up: j.sentiment_votes_up_percentage ?? null,
      down: j.sentiment_votes_down_percentage ?? null,
    });
  } catch {
    return NextResponse.json({ up: null, down: null });
  }
}
