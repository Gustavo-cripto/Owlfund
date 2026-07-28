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
  usdValue: number | null; // valor em USD; null quando o preço do token é desconhecido
  timestamp: number;
};

// Um movimento só é "large_transfer" (o que dispara alertas) quando conseguimos
// confirmar o seu valor em dólares acima deste limiar. Sem preço fiável, fica
// "accumulation" — nunca disparamos alertas por mera contagem de tokens.
const LARGE_TRANSFER_USD = 100_000;

// Stablecoins pareadas ao dólar → 1 token ≈ 1 USD.
const STABLECOINS = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "FDUSD", "PYUSD", "GUSD", "USDD", "FRAX", "LUSD"]);
const ETH_SYMBOLS = new Set(["ETH", "WETH"]);

export type UsdPrices = { btc: number | null; eth: number | null; sol: number | null };

// Cache de processo (best-effort; por instância serverless) para não chamar o
// CoinGecko uma vez por endereço quando o cron varre muitos utilizadores.
let priceCache: { at: number; prices: UsdPrices } | null = null;
const PRICE_TTL_MS = 60_000;

async function getUsdPrices(): Promise<UsdPrices> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.prices;
  let prices: UsdPrices = { btc: null, eth: null, sol: null };
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd",
      { signal: AbortSignal.timeout(6000) },
    );
    if (res.ok) {
      const j = await res.json() as { bitcoin?: { usd?: number }; ethereum?: { usd?: number }; solana?: { usd?: number } };
      prices = { btc: j.bitcoin?.usd ?? null, eth: j.ethereum?.usd ?? null, sol: j.solana?.usd ?? null };
    }
  } catch { /* mantém null → tokens ficam sem valor USD confirmado */ }
  priceCache = { at: Date.now(), prices };
  return prices;
}

// Valor em USD de uma transferência ERC-20, ou null se não o soubermos com
// confiança (só stablecoins e ETH/WETH são fiáveis sem chamar preço por token).
function ethTransferUsd(symbol: string, amount: number, ethPrice: number | null): number | null {
  const s = (symbol ?? "").toUpperCase();
  if (STABLECOINS.has(s)) return amount;
  if (ETH_SYMBOLS.has(s) && ethPrice != null) return amount * ethPrice;
  return null;
}

function classify(usdValue: number | null): Movement["type"] {
  return usdValue != null && usdValue >= LARGE_TRANSFER_USD ? "large_transfer" : "accumulation";
}

function withUsd(base: string, usdValue: number | null): string {
  return usdValue != null ? `${base} (~$${Math.round(usdValue).toLocaleString("en-US")})` : base;
}

export async function fetchEthMovements(address: string, label: string, prices: UsdPrices): Promise<Movement[]> {
  try {
    const apiKey = process.env.MORALIS_API_KEY ?? "";
    if (!apiKey) return [];
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${encodeURIComponent(address)}/erc20/transfers?chain=eth&limit=5`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const data = await res.json() as { result?: Array<{ value: string; token_decimals: string; token_symbol: string; block_timestamp: string; possible_spam?: boolean }> };
    const movs: Movement[] = [];
    for (const tx of data.result ?? []) {
      if (tx.possible_spam) continue; // ignora tokens de spam (reduz ruído nos alertas)
      const decimals = parseInt(tx.token_decimals ?? "18");
      const amount = parseInt(tx.value ?? "0") / Math.pow(10, decimals);
      if (amount <= 0) continue;
      const usdValue = ethTransferUsd(tx.token_symbol, amount, prices.eth);
      movs.push({
        address, label, chain: "eth",
        type: classify(usdValue),
        description: withUsd(`${amount.toFixed(2)} ${tx.token_symbol}`, usdValue),
        usdValue,
        timestamp: new Date(tx.block_timestamp).getTime(),
      });
    }
    return movs.slice(0, 2);
  } catch { return []; }
}

export async function fetchBtcMovements(address: string, label: string, prices: UsdPrices): Promise<Movement[]> {
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
    const usdValue = prices.btc != null ? btcValue * prices.btc : null;
    // BTC quase sempre tem preço; se o fetch falhou, recorre ao limiar de 1 BTC.
    const type = usdValue != null ? classify(usdValue) : (btcValue > 1 ? "large_transfer" : "accumulation");
    return [{
      address, label, chain: "btc",
      type,
      description: withUsd(`${btcValue.toFixed(4)} BTC`, usdValue),
      usdValue,
      timestamp: (latest.status?.block_time ?? Date.now() / 1000) * 1000,
    }];
  } catch { return []; }
}

// Mints SPL conhecidos → símbolo (para valorizar stablecoins a ~$1).
const SOL_MINTS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

// Deteção de movimentos Solana via Helius (API de transações parseadas). O RPC
// público gratuito não classifica transferências, por isso um indexador é o
// único caminho fiável. Sem HELIUS_API_KEY, o SOL fica inativo (devolve []).
export async function fetchSolMovements(address: string, label: string, prices: UsdPrices): Promise<Movement[]> {
  const key = (process.env.HELIUS_API_KEY ?? "").trim();
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${key}&limit=5`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const txs = await res.json() as Array<{
      timestamp?: number;
      nativeTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; amount?: number }>;
      tokenTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; tokenAmount?: number; mint?: string }>;
    }>;
    if (!Array.isArray(txs)) return [];

    // Primeira transação (mais recente) que envolva mesmo o endereço num transfer.
    for (const tx of txs) {
      const ts = (tx.timestamp ?? Date.now() / 1000) * 1000;

      // Maior transferência de token SPL de/para o endereço.
      const tt = (tx.tokenTransfers ?? [])
        .filter((t) => t.fromUserAccount === address || t.toUserAccount === address)
        .sort((a, b) => (b.tokenAmount ?? 0) - (a.tokenAmount ?? 0))[0];
      if (tt && (tt.tokenAmount ?? 0) > 0) {
        const sym = SOL_MINTS[tt.mint ?? ""] ?? "";
        const usdValue = STABLECOINS.has(sym) ? (tt.tokenAmount ?? 0) : null;
        return [{
          address, label, chain: "sol", type: classify(usdValue),
          description: withUsd(`${(tt.tokenAmount ?? 0).toFixed(2)} ${sym || "tokens"}`, usdValue),
          usdValue, timestamp: ts,
        }];
      }

      // Caso contrário, transferências nativas de SOL de/para o endereço.
      const lamports = (tx.nativeTransfers ?? [])
        .filter((t) => t.fromUserAccount === address || t.toUserAccount === address)
        .reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
      const sol = lamports / 1e9;
      if (sol >= 0.01) {
        const usdValue = prices.sol != null ? sol * prices.sol : null;
        return [{
          address, label, chain: "sol", type: classify(usdValue),
          description: withUsd(`${sol.toFixed(4)} SOL`, usdValue),
          usdValue, timestamp: ts,
        }];
      }
    }
    return [];
  } catch { return []; }
}

/** Varre uma watchlist (máx. 10 endereços) e devolve os movimentos mais recentes. */
export async function scanWatchlist(watchlist: WatchEntry[]): Promise<{ movements: Movement[]; scanned: number }> {
  // Defesa em profundidade: descarta endereços malformados antes de os usar em
  // URLs upstream, mesmo que a validação do chamador tenha falhado ou faltado.
  const entries = watchlist.filter((e) => isValidAddress(e.address)).slice(0, 10);
  if (!entries.length) return { movements: [], scanned: 0 };

  // Preços BTC/ETH uma vez por scan (com cache), para valorizar os movimentos.
  const prices = await getUsdPrices();

  const results = await Promise.allSettled(
    entries.map((entry) => {
      if (entry.chain === "btc") return fetchBtcMovements(entry.address, entry.label, prices);
      if (entry.chain === "eth") return fetchEthMovements(entry.address, entry.label, prices);
      if (entry.chain === "sol") return fetchSolMovements(entry.address, entry.label, prices);
      return Promise.resolve([] as Movement[]);
    }),
  );

  const movements = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return { movements, scanned: entries.length };
}
