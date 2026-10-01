// Posições DeFi com detalhe: o formato comum que a rota /api/defi-balance
// devolve e que as Carteiras e o Portefólio mostram. `name` e `usd` mantêm-se
// (é o que o resto do código já usava); o resto é opcional.

export type PosicaoDefi = {
  name: string;
  usd: number;
  protocolo?: string;
  rede?: string;
  tipo?: "liquidez" | "emprestimo" | "staking" | "outro";
  estado?: "aberta" | "fechada";
  par?: string[];
  /** Taxa da pool, em % (0.3 = 0,3%). */
  taxaPool?: number;
  /** Pools concentradas: o preço atual está dentro do intervalo da posição? */
  noIntervalo?: boolean | null;
  /** Preço de par[0] em par[1]: mínimo e máximo da posição e o atual. */
  intervalo?: { min: number; max: number; atual: number | null };
  quantidades?: { simbolo: string; qtd: number }[];
  taxasPorReclamar?: { simbolo: string; qtd: number }[];
  taxasUsd?: number;
  /** Só um lado tem preço conhecido: o valor é estimado (dobro desse lado). */
  valorEstimado?: boolean;
  tokenId?: string;
  depositadoUsd?: number;
  emprestadoUsd?: number;
  fatorSaude?: number | null;
};

/** Preço de token0 em token1 a partir de um tick (Uniswap V3/V4). */
export function precoDoTick(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}

/** Tick atual de um slot0 (V3 pool.slot0 e V4 StateView.getSlot0: 2.ª palavra, int24). */
export function tickDoSlot0(slot0Hex: string): number | null {
  const h = slot0Hex.startsWith("0x") ? slot0Hex.slice(2) : slot0Hex;
  if (h.length < 128) return null;
  const palavra = BigInt("0x" + h.slice(64, 128));
  const v = Number(palavra & BigInt(0xffffff));
  return v >= 0x800000 ? v - 0x1000000 : v;
}

/** Descodifica o retorno de symbol(): string ABI ou bytes32 (tokens antigos, ex.: MKR). */
export function lerSimboloAbi(hex: string): string | null {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!h) return null;
  try {
    if (h.length >= 192) {
      const len = Number(BigInt("0x" + h.slice(64, 128)));
      if (len > 0 && len <= 32) return limpar(Buffer.from(h.slice(128, 128 + len * 2), "hex").toString("utf8"));
    }
    if (h.length === 64) return limpar(Buffer.from(h, "hex").toString("utf8").replace(/\0+$/, ""));
  } catch { /* símbolo ilegível */ }
  return null;
}
const limpar = (s: string) => {
  const x = s.replace(/[^\w.+-]/g, "").slice(0, 12);
  return x || null;
};

/** Par e protocolo a partir de um nome antigo ("Uniswap V2 WETH/PEPE"). */
export function completarPosicao(p: PosicaoDefi & { kind?: string; supplied?: number; borrowed?: number; healthFactor?: number | null; chain?: string }): PosicaoDefi {
  const out: PosicaoDefi = { ...p };
  // Empréstimos (src/lib/defi/lending.ts): depositado, emprestado e fator de saúde.
  if (p.kind === "lending") {
    out.tipo = "emprestimo";
    out.protocolo ??= p.name;
    out.rede ??= p.chain;
    if (typeof p.supplied === "number") out.depositadoUsd = p.supplied;
    if (typeof p.borrowed === "number") out.emprestadoUsd = p.borrowed;
    if (p.healthFactor !== undefined) out.fatorSaude = p.healthFactor;
  }
  if (!out.par) {
    const m = /^(.*?)\s+([A-Za-z0-9.+_-]+(?:\/[A-Za-z0-9.+_-]+)+)$/.exec(p.name.trim());
    if (m) { out.protocolo ??= m[1]; out.par = m[2].split("/"); }
  }
  out.protocolo ??= p.name;
  out.estado ??= "aberta";
  if (!out.tipo) {
    out.tipo = out.emprestadoUsd != null || out.depositadoUsd != null || /aave|spark|compound|morpho|euler|venus/i.test(p.name)
      ? "emprestimo"
      : out.par ? "liquidez" : /eigen|stak|lido|jito|marinade/i.test(p.name) ? "staking" : "outro";
  }
  return out;
}

// Preços USD por símbolo (pares -USDT da OKX), para tokens que não são
// estáveis, ETH ou BTC. Um pedido para todos, em cache 2 minutos.
let cachePrecos: { at: number; mapa: Map<string, number> } | null = null;
export async function precosOkxUsd(): Promise<Map<string, number>> {
  if (cachePrecos && Date.now() - cachePrecos.at < 120_000) return cachePrecos.mapa;
  const mapa = new Map<string, number>();
  try {
    const r = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000), next: { revalidate: 120 },
    });
    const j = (await r.json()) as { code?: string; data?: Array<{ instId: string; last: string }> };
    for (const t of j.data ?? []) {
      if (!t.instId.endsWith("-USDT")) continue;
      const v = Number(t.last);
      if (v > 0) mapa.set(t.instId.slice(0, -5), v);
    }
  } catch { /* sem preços extra */ }
  cachePrecos = { at: Date.now(), mapa };
  return mapa;
}

/** Preço USD por símbolo, tirando o "W" dos embrulhados (WMATIC → MATIC). */
export function precoPorSimbolo(mapa: Map<string, number>, simbolo: string): number {
  const s = simbolo.toUpperCase();
  return mapa.get(s) ?? (s.startsWith("W") ? mapa.get(s.slice(1)) : undefined) ?? 0;
}
