import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pinata first: gotas.social and many collections pin content there and it's the
// most reliable source. The rest are fallbacks for content pinned elsewhere.
const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://nftstorage.link/ipfs/",
  "https://4everland.io/ipfs/",
  "https://w3s.link/ipfs/",
];

const PER_GATEWAY_TIMEOUT = 15_000;

/** Extracts the `<cid>[/path]` portion from an ipfs:// uri or any /ipfs/ gateway url. */
function extractIpfsPath(input: string): string | null {
  const s = input.trim();
  if (s.startsWith("ipfs://")) return s.slice(7).replace(/^ipfs\//, "");
  const m = s.match(/\/ipfs\/(.+)$/);
  if (m) return m[1];
  // bare CID
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[a-z0-9]{20,})/.test(s)) return s;
  return null;
}

function isServeableType(ct: string): boolean {
  if (!ct) return true; // some gateways omit it for octet streams
  return (
    ct.startsWith("image/") ||
    ct.startsWith("video/") ||
    ct.startsWith("application/json") ||
    ct.startsWith("application/octet-stream") ||
    ct.startsWith("text/plain") // some metadata served as text/plain
  );
}

export async function GET(req: NextRequest) {
  const cidParam = req.nextUrl.searchParams.get("cid");
  const urlParam = req.nextUrl.searchParams.get("url");
  const ipfsPath = cidParam ?? (urlParam ? extractIpfsPath(urlParam) : null);

  if (!ipfsPath || ipfsPath.length > 256 || ipfsPath.includes("..")) {
    return NextResponse.json({ error: "CID inválido." }, { status: 400 });
  }

  // Race every gateway in parallel; first valid response wins, the rest are aborted.
  const controllers: AbortController[] = [];
  const attempts = GATEWAYS.map((gw) => {
    const ac = new AbortController();
    controllers.push(ac);
    const timer = setTimeout(() => ac.abort(), PER_GATEWAY_TIMEOUT);
    return (async () => {
      try {
        const res = await fetch(`${gw}${ipfsPath}`, { signal: ac.signal, redirect: "follow" });
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && isServeableType(ct)) {
          const buf = await res.arrayBuffer();
          return { buf, ct };
        }
        throw new Error(`${gw} -> ${res.status} ${ct}`);
      } finally {
        clearTimeout(timer);
      }
    })();
  });

  try {
    const winner = await Promise.any(attempts);
    // Abort the losers to free sockets.
    controllers.forEach((c) => { try { c.abort(); } catch { /* ignore */ } });
    return new NextResponse(winner.buf, {
      status: 200,
      headers: {
        "Content-Type": winner.ct || "application/octet-stream",
        // Cache the resolved bytes at the Vercel edge for a year — each unique
        // IPFS object is fetched from a gateway only once.
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    });
  } catch {
    controllers.forEach((c) => { try { c.abort(); } catch { /* ignore */ } });
    // Short cache on failure so a later request can retry once gateways recover.
    return NextResponse.json(
      { error: "Não foi possível obter o conteúdo IPFS." },
      { status: 502, headers: { "Cache-Control": "public, max-age=30" } }
    );
  }
}
