// Pull do portfólio do SITE (chainfolioai.com) para a app.
//
// O site guarda tudo em /api/wallet-sync como blob v3:
//   { v:3, registry:{accounts,activeId}, data:{ [accountId]: { [baseKey]: rawString } } }
// baseKeys que interessam aqui:
//   owlfund.crypto.holdings.v1      → Record<symbol, {buyValue?, quantity?, buyDate?}>
//   owlfund.traditional.holdings.v1 → Record<symbol, {buyValue?, buyDate?}>
// (portfolio-wallets = carteiras on-chain; fica para uma fase seguinte — exige
//  buscar saldos por chain, que o site faz com APIs próprias.)
//
// v1 da app = LEITURA. Agregamos TODAS as contas (como a vista "Todas" do site):
// soma quantidade e valor investido por símbolo.
import type { Category } from '@/data/portfolio';
import { SITE_URL, getSupabase } from '@/lib/supabase';

type CryptoHolding = { buyValue?: number; quantity?: number; buyDate?: string };
type TraditionalHolding = { buyValue?: number; buyDate?: string };

type CloudBlobV3 = {
  v: 3;
  registry: { accounts: { id: string; name: string }[]; activeId: string };
  data: Record<string, Record<string, string>>;
};

const CRYPTO_BASE = 'owlfund.crypto.holdings.v1';
const TRADITIONAL_BASE = 'owlfund.traditional.holdings.v1';

// Nomes bonitos para símbolos comuns (fallback: o próprio símbolo).
const SYMBOL_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  BNB: 'BNB',
  XRP: 'XRP',
  USDT: 'Tether',
  USDC: 'USD Coin',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  DOT: 'Polkadot',
  MATIC: 'Polygon',
  LINK: 'Chainlink',
  AVAX: 'Avalanche',
  TRX: 'TRON',
  LTC: 'Litecoin',
};

const parseJson = <T,>(raw: string | undefined): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/** Converte o blob v3 nas categorias do modelo da app (agregando as contas). */
export function blobToCategories(blob: CloudBlobV3): Category[] {
  const crypto = new Map<string, { invested: number; quantity: number }>();
  const traditional = new Map<string, { invested: number }>();

  for (const perAcc of Object.values(blob.data ?? {})) {
    const c = parseJson<Record<string, CryptoHolding>>(perAcc[CRYPTO_BASE]);
    if (c) {
      for (const [symRaw, h] of Object.entries(c)) {
        const sym = symRaw.toUpperCase();
        const cur = crypto.get(sym) ?? { invested: 0, quantity: 0 };
        cur.invested += Number(h.buyValue ?? 0) || 0;
        cur.quantity += Number(h.quantity ?? 0) || 0;
        crypto.set(sym, cur);
      }
    }
    const t = parseJson<Record<string, TraditionalHolding>>(perAcc[TRADITIONAL_BASE]);
    if (t) {
      for (const [symRaw, h] of Object.entries(t)) {
        const sym = symRaw.toUpperCase();
        const cur = traditional.get(sym) ?? { invested: 0 };
        cur.invested += Number(h.buyValue ?? 0) || 0;
        traditional.set(sym, cur);
      }
    }
  }

  const categories: Category[] = [];
  if (traditional.size > 0) {
    categories.push({
      id: 'traditional',
      name: 'Mercado Tradicional',
      assets: Array.from(traditional.entries()).map(([sym, v]) => ({
        id: `cloud_trad_${sym}`,
        name: SYMBOL_NAMES[sym] ?? sym,
        symbol: sym,
        invested: v.invested,
      })),
    });
  }
  if (crypto.size > 0) {
    categories.push({
      id: 'crypto',
      name: 'Cripto',
      assets: Array.from(crypto.entries()).map(([sym, v]) => ({
        id: `cloud_crypto_${sym}`,
        name: SYMBOL_NAMES[sym] ?? sym,
        symbol: sym,
        invested: v.invested,
        ...(v.quantity > 0 ? { quantity: v.quantity } : {}),
      })),
    });
  }
  return categories;
}

export type PullResult =
  | { ok: true; categories: Category[]; isEmpty: boolean }
  | { ok: false; error: string };

/** Vai buscar o portfólio do site com a sessão atual. */
export async function pullCloudPortfolio(): Promise<PullResult> {
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: 'Sessão expirada — entra de novo.' };

    const res = await fetch(`${SITE_URL}/api/wallet-sync`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { ok: false, error: 'Sessão inválida — entra de novo.' };
    if (!res.ok) return { ok: false, error: `O site respondeu ${res.status}.` };

    const json = (await res.json()) as { data?: unknown };
    const blob = json?.data as CloudBlobV3 | null;
    if (!blob || blob.v !== 3 || !blob.data) {
      // Conta sem dados sincronizados ainda (ou formato antigo) — não é erro.
      return { ok: true, categories: [], isEmpty: true };
    }
    const categories = blobToCategories(blob);
    return { ok: true, categories, isEmpty: categories.length === 0 };
  } catch {
    return { ok: false, error: 'Sem ligação ao site. Tenta novamente.' };
  }
}
