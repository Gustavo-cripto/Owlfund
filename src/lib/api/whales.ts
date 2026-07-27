// Deteção de movimentos de carteiras ("whales"), partilhada pela rota interna
// (/api/smart-money-rt) e pela API pública (/api/v1/whales) e MCP.

export type WatchEntry = { address: string; label: string; chain: "eth" | "sol" | "btc" };

// Endereços são alfanuméricos (0x-hex, base58, bech32). Rejeita tudo o resto —
// em especial `/`, `?`, `.` que poderiam manipular o path dos pedidos upstream.
// Fonte única, partilhada pela rota REST (/api/v1/whales) e pelo tool MCP.
export const ADDRESS_RE = /^[a-zA-Z0-9]{10,120}$/;

export function isValidAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

export type Movement = {
  address: string;
  label: string;
  chain: string;
  type: "large_transfer" | "accumulation" | "distribution" | "new_token";
  description: string;
  usdValue: number;
  timestamp: number;
};

export async function fetchEthMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const apiKey = process.env.MORALIS_API_KEY ?? "";
    if (!apiKey) return [];
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${encodeURIComponent(address)}/erc20/transfers?chain=eth&limit=5`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { result?: Array<{ value: string; token_decimals: string; token_symbol: string; block_timestamp: string }> };
    const movs: Movement[] = [];
    for (const tx of data.result ?? []) {
      const decimals = parseInt(tx.token_decimals ?? "18");
      const amount = parseInt(tx.value ?? "0") / Math.pow(10, decimals);
      if (amount > 0) {
        movs.push({
          address, label, chain: "eth",
          type: amount > 100000 ? "large_transfer" : "accumulation",
          description: `${amount.toFixed(2)} ${tx.token_symbol}`,
          usdValue: 0,
          timestamp: new Date(tx.block_timestamp).getTime(),
        });
      }
    }
    return movs.slice(0, 2);
  } catch { return []; }
}

export async function fetchBtcMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const res = await fetch(
      `https://mempool.space/api/address/${encodeURIComponent(address)}/txs`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const txs = await res.json() as Array<{ txid: string; status: { block_time: number }; vout: Array<{ value: number }> }>;
    if (!txs?.length) return [];
    const latest = txs[0];
    const totalSats = (latest.vout ?? []).reduce((s: number, o) => s + (o.value ?? 0), 0);
    const btcValue = totalSats / 1e8;
    if (btcValue < 0.01) return [];
    return [{
      address, label, chain: "btc",
      type: btcValue > 1 ? "large_transfer" : "accumulation",
      description: `${btcValue.toFixed(4)} BTC`,
      usdValue: 0,
      timestamp: (latest.status?.block_time ?? Date.now() / 1000) * 1000,
    }];
  } catch { return []; }
}

/** Varre uma watchlist (máx. 10 endereços) e devolve os movimentos mais recentes. */
export async function scanWatchlist(watchlist: WatchEntry[]): Promise<{ movements: Movement[]; scanned: number }> {
  // Defesa em profundidade: descarta endereços malformados antes de os usar em
  // URLs upstream, mesmo que a validação do chamador tenha falhado ou faltado.
  const entries = watchlist.filter((e) => isValidAddress(e.address)).slice(0, 10);
  if (!entries.length) return { movements: [], scanned: 0 };

  const results = await Promise.allSettled(
    entries.map((entry) => {
      if (entry.chain === "btc") return fetchBtcMovements(entry.address, entry.label);
      if (entry.chain === "eth") return fetchEthMovements(entry.address, entry.label);
      return Promise.resolve([] as Movement[]);
    }),
  );

  const movements = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return { movements, scanned: entries.length };
}
