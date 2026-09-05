import { NextResponse } from "next/server";

// Proxy do Fear & Greed (alternative.me): o fetch direto do browser é bloqueado
// por adblockers/CORS em muitos utilizadores. Cache de 10 min no servidor.
export const revalidate = 600;

export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=90&format=json", {
      next: { revalidate: 600 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return NextResponse.json({ error: `fng ${res.status}` }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "fng unavailable" }, { status: 502 });
  }
}
