import Wallet, { AddressPurpose, getSupportedWallets } from "sats-connect";

export const getBtcWalletProviders = () => {
  if (typeof window === "undefined") return [];
  return getSupportedWallets();
};

export const isXverseAvailable = () => {
  if (typeof window === "undefined") return false;
  return getSupportedWallets().some((wallet) => wallet.id === "xverse" && wallet.isInstalled);
};

/** Verifica se uma carteira BTC (por id) está instalada, ou se alguma está disponível se id for omitido. */
export const isBtcWalletAvailable = (providerId?: string): boolean => {
  if (typeof window === "undefined") return false;
  const list = getSupportedWallets();
  if (providerId) return list.some((w) => w.id === providerId && w.isInstalled);
  return list.some((w) => w.isInstalled);
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
