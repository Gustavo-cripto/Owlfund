import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inscription content CDNs, raced in parallel; first valid response wins.
const ORD_CDNS = [
  "https://ord-mirror.magiceden.dev/content/",
  "https://ordinals.com/content/",
  "https://static.unisat.io/content/",
];

const PER_CDN_TIMEOUT = 12_000;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id || !/^[0-9a-fA-F]{64}i\d+$/.test(id)) {
    return NextResponse.json({ error: "Inscription id inválido." }, { status: 400 });
  }

  const controllers: AbortController[] = [];
  const attempts = ORD_CDNS.map((cdn) => {
    const ac = new AbortController();
    controllers.push(ac);
    const timer = setTimeout(() => ac.abort(), PER_CDN_TIMEOUT);
    return (async () => {
      try {
        const res = await fetch(`${cdn}${id}`, {
          signal: ac.signal,
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const ct = res.headers.get("content-type") ?? "";
        // Accept real inscription payloads (image/svg/json/…); reject gateway
        // HTML error pages (image/svg+xml is not text/html, so it passes).
        if (res.ok && !ct.startsWith("text/html")) {
          const buf = await res.arrayBuffer();
          return { buf, ct };
        }
        throw new Error(`${cdn} -> ${res.status} ${ct}`);
      } finally {
        clearTimeout(timer);
      }
    })();
  });

  try {
    const winner = await Promise.any(attempts);
    controllers.forEach((c) => { try { c.abort(); } catch { /* ignore */ } });
    return new NextResponse(winner.buf, {
      status: 200,
      headers: {
        "Content-Type": winner.ct || "application/octet-stream",
        // Inscriptions are immutable — cache the bytes at the edge for a year.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch {
    controllers.forEach((c) => { try { c.abort(); } catch { /* ignore */ } });
    return NextResponse.json(
      { error: "Conteúdo indisponível." },
      { status: 502, headers: { "Cache-Control": "public, max-age=30" } }
    );
  }
}
