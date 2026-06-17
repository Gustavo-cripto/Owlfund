import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };

type UnisatRune = {
  rune?: string;
  runeid?: string;
  spacedRune?: string;
  amount?: string;
  symbol?: string;
  divisibility?: number;
};

function formatAmount(amount: string, divisibility: number): string {
  if (!divisibility || divisibility <= 0) return amount;
  try {
    const negative = amount.startsWith("-");
    const digits = negative ? amount.slice(1) : amount;
    const padded = digits.padStart(divisibility + 1, "0");
    const intPart = padded.slice(0, padded.length - divisibility);
    const fracPart = padded.slice(padded.length - divisibility).replace(/0+$/, "");
    const out = fracPart ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${out}` : out;
  } catch {
    return amount;
  }
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiados pedidos." }, { status: 429 });
  }

  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address || !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/.test(address)) {
    return NextResponse.json({ error: "Endereço Bitcoin inválido.", runes: [] }, { status: 400 });
  }

  const key = process.env.UNISAT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "UNISAT_API_KEY não configurada.", runes: [] }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://open-api.unisat.io/v1/indexer/address/${encodeURIComponent(address)}/runes/balance-list?start=0&limit=100`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12_000) }
    );
    if (!res.ok) return NextResponse.json({ runes: [] }, { headers: CACHE_HEADERS });
    const json = (await res.json()) as { code?: number; data?: { detail?: UnisatRune[] } };
    if (json.code !== 0) return NextResponse.json({ runes: [] }, { headers: CACHE_HEADERS });
    const runes = (json.data?.detail ?? [])
      .filter((r) => r.amount && r.amount !== "0")
      .map((r) => ({
        symbol: r.rune ?? "?",
        displayName: r.spacedRune ?? r.rune ?? "?",
        amount: formatAmount(r.amount ?? "0", r.divisibility ?? 0),
        runeSymbol: r.symbol ?? "",
      }));
    return NextResponse.json({ runes }, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json({ runes: [] }, { status: 502 });
  }
}
