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

export const connectXverse = async () => {
  const response = await Wallet.request("getAccounts", {
    purposes: [AddressPurpose.Payment],
    message: "Permita o acesso para leitura do saldo.",
  });

  if (response.status === "error") {
    throw new Error(response.error?.message ?? "Falha ao conectar com Xverse.");
  }

  const account = response.result?.[0];
  if (!account?.address) {
    throw new Error("Nenhum endereço retornado pela Xverse.");
  }

  return account.address;
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

export const getBtcBalanceFromAddress = async (address: string) => {
  const response = await fetch(`https://blockstream.info/api/address/${address}`);
  if (!response.ok) {
    throw new Error("Falha ao consultar saldo BTC.");
  }

  const data = await response.json();
  const funded = Number(data?.chain_stats?.funded_txo_sum ?? 0);
  const spent = Number(data?.chain_stats?.spent_txo_sum ?? 0);
  return (funded - spent) / 1e8;
};
