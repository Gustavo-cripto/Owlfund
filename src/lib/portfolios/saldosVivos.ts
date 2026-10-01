import type { CarteiraFria } from "@/lib/portfolios/ativosConta";

// Saldos que as Carteiras vão buscar em direto e que só ficam guardados em
// total: exchanges ligadas por API (e Hyperliquid) e tokens das carteiras
// frias. A aba "O meu portefólio" pede-os da mesma maneira, moeda a moeda.

export type SaldoVivo = { symbol: string; quantidade: number; usd?: number };

const somar = (lista: SaldoVivo[]): SaldoVivo[] => {
  const m = new Map<string, SaldoVivo>();
  for (const s of lista) {
    const k = s.symbol.trim().toUpperCase();
    if (!k || !(s.quantidade > 0)) continue;
    const x = m.get(k) ?? { symbol: k, quantidade: 0 };
    x.quantidade += s.quantidade;
    if (s.usd != null) x.usd = (x.usd ?? 0) + s.usd;
    m.set(k, x);
  }
  return [...m.values()];
};

const lerLocal = <T,>(chave: string): T[] => {
  try { return JSON.parse(window.localStorage.getItem(chave) ?? "[]") as T[]; } catch { return []; }
};

/** Exchanges por API (as deste navegador e as guardadas no servidor) e Hyperliquid. */
export async function lerSaldosExchanges(): Promise<{ saldos: SaldoVivo[]; falhas: number }> {
  type Local = { exchange: string; apiKey: string; apiSecret: string; apiPassphrase?: string };
  type Saldo = { asset: string; total: number };
  let falhas = 0;
  const pedidos: Array<Promise<SaldoVivo[]>> = [];
  for (const a of lerLocal<Local>("cex-accounts-v1")) {
    pedidos.push(fetch("/api/cex-balance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: a.exchange, apiKey: a.apiKey, apiSecret: a.apiSecret, apiPassphrase: a.apiPassphrase }),
    }).then((r) => r.json() as Promise<{ balances?: Saldo[]; error?: string }>)
      .then((d) => { if (d.error) falhas++; return (d.balances ?? []).map((b) => ({ symbol: b.asset, quantidade: b.total })); })
      .catch(() => { falhas++; return []; }));
  }
  pedidos.push(fetch("/api/cex-keys").then((r) => (r.ok ? r.json() : null))
    .then((d: { accounts?: Array<{ balances: Saldo[] | null }> } | null) =>
      (d?.accounts ?? []).flatMap((a) => (a.balances ?? []).map((b) => ({ symbol: b.asset, quantidade: b.total }))))
    .catch(() => []));
  for (const h of lerLocal<{ address: string }>("hl-accounts-v1")) {
    pedidos.push(fetch("/api/hyperliquid-balance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: h.address }),
    }).then((r) => r.json() as Promise<{ spotBalances?: Array<{ coin: string; total: number }>; error?: string }>)
      .then((d) => { if (d.error) falhas++; return (d.spotBalances ?? []).map((b) => ({ symbol: b.coin, quantidade: b.total })); })
      .catch(() => { falhas++; return []; }));
  }
  const listas = await Promise.all(pedidos);
  return { saldos: somar(listas.flat()), falhas };
}

/** Tokens ERC-20/SPL das carteiras frias, sem o nativo das redes já registadas. */
export async function lerTokensFrias(frias: readonly CarteiraFria[]): Promise<{ saldos: SaldoVivo[]; falhas: number }> {
  type Token = { address: string; symbol: string; balance: string; usdValue: number; network?: string };
  let falhas = 0;
  const listas = await Promise.all(frias.map((f) =>
    fetch(`/api/token-balances?address=${encodeURIComponent(f.address)}&chain=${f.chain}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { tokens?: Token[]; error?: string };
        if (!r.ok || d.error) { falhas++; return []; }
        return (d.tokens ?? [])
          .filter((t) => !(t.address === "native" && (!t.network || f.redes.includes(t.network))))
          .map((t) => ({ symbol: t.symbol, quantidade: Number(t.balance), usd: Number.isFinite(t.usdValue) ? t.usdValue : undefined }));
      })
      .catch(() => { falhas++; return []; })));
  return { saldos: somar(listas.flat()), falhas };
}
