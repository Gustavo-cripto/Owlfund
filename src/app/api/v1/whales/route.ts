import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAINS = new Set(["eth", "btc", "sol"]);
// Endereços são alfanuméricos (0x-hex, base58, bech32). Rejeita tudo o resto.
const ADDRESS_RE = /^[a-zA-Z0-9]{10,120}$/;

type ParseResult =
  | { ok: true; watchlist: WatchEntry[] }
  | { ok: false; error: string; message: string };

function parseWatchlist(raw: string | null): ParseResult {
  if (!raw) return { ok: false, error: "missing_watchlist", message: "Passa ?watchlist=<JSON url-encoded> com [{ address, chain, label }]." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid_watchlist", message: "watchlist tem de ser JSON válido." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "invalid_watchlist", message: "watchlist tem de ser um array com pelo menos 1 endereço." };
  }
  if (parsed.length > 10) {
    return { ok: false, error: "too_many", message: "Máximo de 10 endereços por pedido." };
  }

  const watchlist: WatchEntry[] = [];
  for (const item of parsed) {
    const entry = item as { address?: unknown; chain?: unknown; label?: unknown };
    const address = typeof entry.address === "string" ? entry.address.trim() : "";
    const chain = typeof entry.chain === "string" ? entry.chain.toLowerCase() : "";
    if (!ADDRESS_RE.test(address)) {
      return { ok: false, error: "invalid_address", message: `Endereço inválido: ${String(entry.address).slice(0, 20)}` };
    }
    if (!CHAINS.has(chain)) {
      return { ok: false, error: "invalid_chain", message: `chain tem de ser "eth", "btc" ou "sol". Recebido: ${String(entry.chain)}` };
    }
    const label = typeof entry.label === "string" ? entry.label.slice(0, 64) : "";
    watchlist.push({ address, chain: chain as WatchEntry["chain"], label });
  }
  return { ok: true, watchlist };
}

// GET /api/v1/whales?watchlist=<JSON> — movimentos recentes dos endereços dados.
// watchlist: array url-encoded de { address, chain: "eth"|"btc"|"sol", label }.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const parsed = parseWatchlist(req.nextUrl.searchParams.get("watchlist"));
  if (!parsed.ok) return apiJson({ error: parsed.error, message: parsed.message }, { status: 400 });

  const { movements, scanned } = await scanWatchlist(parsed.watchlist);
  return apiJson({ movements, scanned, timestamp: Date.now() });
}
