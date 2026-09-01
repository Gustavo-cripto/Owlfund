// Carteiras on-chain da conta — ler/editar o blob do site (wallet-sync) e
// atualizar saldos ao vivo pelos endpoints públicos do site.
import { SITE_URL, getSupabase } from '@/lib/supabase';

export type Chain = 'eth' | 'sol' | 'btc' | 'ada';

export type WalletEntry = {
  address?: string;
  balance?: string;
  network?: string;
  label?: string;
  source?: string;
};

type Snapshot = Partial<Record<Chain, WalletEntry[]>> & Record<string, unknown>;

type BlobV3 = {
  v: 3;
  registry: { accounts: { id: string; name: string }[]; activeId: string };
  data: Record<string, Record<string, string>>;
};

const WALLETS_BASE = 'portfolio-wallets';

export const CHAIN_LABEL: Record<Chain, string> = { eth: 'Ethereum', sol: 'Solana', btc: 'Bitcoin', ada: 'Cardano' };
export const CHAIN_SYMBOL: Record<Chain, string> = { eth: 'ETH', sol: 'SOL', btc: 'BTC', ada: 'ADA' };

export const validAddress = (chain: Chain, addr: string): boolean => {
  const a = addr.trim();
  if (chain === 'eth') return /^0x[a-fA-F0-9]{40}$/.test(a);
  if (chain === 'btc') return /^(bc1[a-z0-9]{20,80}|[13][a-km-zA-HJ-NP-Z1-9]{25,40})$/.test(a);
  if (chain === 'sol') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  return /^addr1[a-z0-9]+$/i.test(a);
};

async function authHeader(): Promise<Record<string, string> | null> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function fetchBlob(): Promise<BlobV3 | null> {
  const h = await authHeader();
  if (!h) return null;
  const res = await fetch(`${SITE_URL}/api/wallet-sync`, { headers: h });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: unknown };
  const blob = json?.data as BlobV3 | null;
  return blob && blob.v === 3 && blob.data ? blob : null;
}

async function pushBlob(blob: BlobV3): Promise<boolean> {
  const h = await authHeader();
  if (!h) return false;
  const res = await fetch(`${SITE_URL}/api/wallet-sync`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: blob }),
  });
  return res.ok;
}

const parseSnap = (raw: string | undefined): Snapshot => {
  if (!raw) return {};
  try {
    const s = JSON.parse(raw) as Snapshot;
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
};

export type AccountWallets = {
  accountId: string;
  accountName: string;
  isActive: boolean;
  wallets: { chain: Chain; entry: WalletEntry; index: number }[];
};

/** Lista as carteiras de todas as contas (a ativa primeiro). */
export async function listWallets(): Promise<AccountWallets[] | null> {
  const blob = await fetchBlob();
  if (!blob) return null;
  const chains: Chain[] = ['eth', 'sol', 'btc', 'ada'];
  const out: AccountWallets[] = blob.registry.accounts.map((acc) => {
    const snap = parseSnap(blob.data[acc.id]?.[WALLETS_BASE]);
    const wallets: AccountWallets['wallets'] = [];
    for (const chain of chains) {
      const list = Array.isArray(snap[chain]) ? (snap[chain] as WalletEntry[]) : [];
      list.forEach((entry, index) => {
        if (entry?.address) wallets.push({ chain, entry, index });
      });
    }
    return {
      accountId: acc.id,
      accountName: acc.name,
      isActive: acc.id === blob.registry.activeId,
      wallets,
    };
  });
  return out.sort((a, b) => Number(b.isActive) - Number(a.isActive));
}

/** Saldo ao vivo pelos endpoints do site. Devolve o saldo (unidades nativas) ou null. */
export async function fetchLiveBalance(chain: Chain, address: string): Promise<number | null> {
  const path =
    chain === 'eth'
      ? `/api/evm-balance?address=${encodeURIComponent(address)}&network=Ethereum`
      : chain === 'btc'
        ? `/api/btc-balance?address=${encodeURIComponent(address)}`
        : chain === 'sol'
          ? `/api/sol-balance?address=${encodeURIComponent(address)}`
          : `/api/ada-balance?address=${encodeURIComponent(address)}`;
  try {
    const res = await fetch(`${SITE_URL}${path}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { balance?: number | string };
    const n = Number(json.balance);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Adiciona uma carteira à conta ATIVA e envia para a nuvem. */
export async function addWallet(chain: Chain, address: string, balance: number | null): Promise<string | null> {
  const blob = await fetchBlob();
  if (!blob) return 'Sessão expirada — entra de novo na tab Conta.';
  const accId = blob.registry.activeId || blob.registry.accounts[0]?.id;
  if (!accId) return 'Conta não encontrada.';
  const perAcc = blob.data[accId] ?? (blob.data[accId] = {});
  const snap = parseSnap(perAcc[WALLETS_BASE]);
  const list = Array.isArray(snap[chain]) ? (snap[chain] as WalletEntry[]) : [];
  if (list.some((e) => e.address?.toLowerCase() === address.toLowerCase())) {
    return 'Esse endereço já está adicionado.';
  }
  list.push({
    address,
    network: CHAIN_LABEL[chain],
    label: `${CHAIN_SYMBOL[chain]} · app`,
    source: 'manual',
    ...(balance != null ? { balance: String(balance) } : {}),
  });
  (snap as Record<string, unknown>)[chain] = list;
  perAcc[WALLETS_BASE] = JSON.stringify(snap);
  const ok = await pushBlob(blob);
  return ok ? null : 'Falha ao guardar no site. Tenta novamente.';
}

/** Remove uma carteira (por conta+chain+índice) e envia para a nuvem. */
export async function removeWallet(accountId: string, chain: Chain, index: number): Promise<string | null> {
  const blob = await fetchBlob();
  if (!blob) return 'Sessão expirada — entra de novo na tab Conta.';
  const perAcc = blob.data[accountId];
  if (!perAcc) return 'Conta não encontrada.';
  const snap = parseSnap(perAcc[WALLETS_BASE]);
  const list = Array.isArray(snap[chain]) ? (snap[chain] as WalletEntry[]) : [];
  if (index < 0 || index >= list.length) return 'Carteira não encontrada (atualiza a lista).';
  list.splice(index, 1);
  (snap as Record<string, unknown>)[chain] = list;
  perAcc[WALLETS_BASE] = JSON.stringify(snap);
  const ok = await pushBlob(blob);
  return ok ? null : 'Falha ao guardar no site. Tenta novamente.';
}
