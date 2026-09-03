import Wallet, { AddressPurpose, getSupportedWallets } from "sats-connect";

export const getBtcWalletProviders = () => {
  if (typeof window === "undefined") return [];
  return getSupportedWallets();
};

/** Ids reais devolvidos por getSupportedWallets() para cada opção da UI. */
const BTC_PROVIDER_ID_MAP: Record<string, string[]> = {
  xverse: ["xverse", "XverseProviders.BitcoinProvider"],
  electrum: ["electrum"],
  coinbase: ["coinbase", "CoinbaseWalletBitcoinProvider"],
  exodus: ["exodus", "ExodusBitcoinProvider"],
};

/** Exodus não está na lista da sats-connect; detetamos pela extensão/app (window.ExodusBitcoinProvider ou window.exodus ou btc_providers). */
function isExodusInjected(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as unknown as { ExodusBitcoinProvider?: unknown }).ExodusBitcoinProvider) return true;
  if ((window as unknown as { exodus?: unknown }).exodus) return true;
  const btcProviders = (window as unknown as { btc_providers?: Array<{ id?: string; name?: string }> }).btc_providers;
  if (Array.isArray(btcProviders)) {
    const lower = (s: string) => s.toLowerCase();
    if (btcProviders.some((p) => lower(String(p?.id ?? "")).includes("exodus") || lower(String(p?.name ?? "")).includes("exodus")))
      return true;
  }
  return false;
}

export const isXverseAvailable = () => {
  if (typeof window === "undefined") return false;
  const ids = BTC_PROVIDER_ID_MAP.xverse;
  return getSupportedWallets().some(
    (wallet) => ids.includes(wallet.id) && wallet.isInstalled
  );
};

/** Verifica se uma carteira BTC (por id da UI) está instalada, ou se alguma está disponível se id for omitido. */
export const isBtcWalletAvailable = (providerId?: string): boolean => {
  if (typeof window === "undefined") return false;
  if (providerId === "exodus") return isExodusInjected();
  const list = getSupportedWallets();
  if (providerId) {
    const idsToCheck = BTC_PROVIDER_ID_MAP[providerId] ?? [providerId];
    return list.some((w) => idsToCheck.includes(w.id) && w.isInstalled);
  }
  return list.some((w) => w.isInstalled) || isExodusInjected();
};

/** Endereços devolvidos pela Xverse: payment (BTC) + ordinals (taproot, onde vivem Ordinals/Runes). */
export type XverseAddresses = { payment: string; ordinals?: string };

const requestAccounts = async (purposes: AddressPurpose[]) =>
  Wallet.request("getAccounts", {
    purposes,
    message: "Permite o acesso para leitura do saldo, Ordinals e Runes.",
  });

export const connectXverse = async (): Promise<XverseAddresses> => {
  // Tenta pagamento + ordinals/taproot; se a carteira recusar o pedido duplo,
  // recai para só pagamento (comportamento clássico) para nunca falhar a ligação.
  let response = await requestAccounts([AddressPurpose.Payment, AddressPurpose.Ordinals]);
  if (response.status === "error") {
    response = await requestAccounts([AddressPurpose.Payment]);
  }
  if (response.status === "error") {
    throw new Error(response.error?.message ?? "Falha ao ligar à Xverse.");
  }

  const accounts = response.result ?? [];
  const payment = accounts.find((a) => a.purpose === AddressPurpose.Payment)?.address
    ?? accounts[0]?.address;
  const ordinals = accounts.find((a) => a.purpose === AddressPurpose.Ordinals)?.address;
  if (!payment) {
    throw new Error("Nenhum endereço devolvido pela Xverse.");
  }

  return { payment, ordinals };
};

export const getBtcBalanceFromWallet = async () => {
  const response = await Wallet.request("getBalance", null);
  if (response.status === "error") {
    return null;
  }

  const total = response.result?.total;
  if (!total) return null;

  return Number(total) / 1e8;
};

const parseBtcBalance = (data: unknown): number => {
  const d = data as Record<string, unknown>;
  const stats = (d?.chain_stats ?? d?.chainStats ?? d) as Record<string, unknown>;
  const funded = Number(stats?.funded_txo_sum ?? 0);
  const spent = Number(stats?.spent_txo_sum ?? 0);
  return (funded - spent) / 1e8;
};

export const getBtcBalanceFromAddress = async (address: string): Promise<number> => {
  const endpoints = [
    `https://mempool.space/api/address/${address}`,
    `https://blockstream.info/api/address/${address}`,
    `https://mempool.space/api/address/${address}`, // retry mempool on blockstream fail
  ];

  let lastErr: unknown;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      return parseBtcBalance(data);
    } catch (err) {
      lastErr = err;
    }
  }

  // Last resort: proxy via API route (avoids CORS)
  try {
    const res = await fetch(`/api/btc-balance?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json() as { balance?: number };
      if (typeof data.balance === "number") return data.balance;
    }
  } catch { /* ignore */ }

  throw lastErr ?? new Error("Falha ao consultar saldo BTC.");
};

/** Saldo Runes por endereço Bitcoin. Proxy server-side via UniSat (a chave fica no servidor). */
export type RunesBalanceEntry = { symbol: string; displayName: string; amount: string };

export const getRunesBalancesForAddress = async (
  address: string
): Promise<RunesBalanceEntry[]> => {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/runes-balance?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { runes?: RunesBalanceEntry[] };
    return Array.isArray(data.runes) ? data.runes : [];
  } catch {
    return [];
  }
};
