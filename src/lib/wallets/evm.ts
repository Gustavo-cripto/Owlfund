import { createPublicClient, formatEther, http } from "viem";
import { arbitrum, base, mainnet, optimism, polygon } from "viem/chains";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(mainnet.rpcUrls.default.http[0]),
});

const chainMap = {
  Ethereum: mainnet,
  Arbitrum: arbitrum,
  Optimism: optimism,
  Base: base,
  Polygon: polygon,
};

export type EvmNetwork = keyof typeof chainMap;

export type EvmProviderId = "metamask" | "coinbase" | "trust" | "binance" | "unknown";

type EvmProvider = typeof window.ethereum;

const isMetaMaskProvider = (provider?: EvmProvider) =>
  !!provider && !!provider.isMetaMask && !("isPhantom" in provider);

const getProviderId = (provider?: EvmProvider): EvmProviderId => {
  if (!provider) return "unknown";
  if (provider.isMetaMask) return "metamask";
  if ("isCoinbaseWallet" in provider) return "coinbase";
  if ("isTrust" in provider || "isTrustWallet" in provider) return "trust";
  if ("isLedgerLive" in provider || "isLedger" in provider) return "unknown";
  if ("isBinanceChain" in provider || "isBinance" in provider) return "binance";
  return "unknown";
};

export const getEvmProviderLabel = (id: EvmProviderId) => {
  switch (id) {
    case "metamask":
      return "MetaMask";
    case "coinbase":
      return "Coinbase Wallet";
    case "trust":
      return "Trust Wallet";
    case "binance":
      return "Binance Chain Wallet";
    default:
      return "Carteira EVM";
  }
};

const getAllProviders = (): EvmProvider[] => {
  if (typeof window === "undefined") return [];
  const ethereum = window.ethereum as (EvmProvider & { providers?: EvmProvider[] }) | undefined;
  if (!ethereum) return [];
  if (Array.isArray(ethereum.providers) && ethereum.providers.length) {
    return ethereum.providers.filter((provider) => provider && !("isPhantom" in provider));
  }
  return [ethereum];
};

const getMetaMaskProvider = () => {
  const providers = getAllProviders();
  return providers.find((provider) => isMetaMaskProvider(provider)) ?? null;
};

export const getEvmProviderOptions = () => {
  const providers = getAllProviders();
  const seen = new Set<EvmProviderId>();
  const options: Array<{ id: EvmProviderId; label: string }> = [];
  providers.forEach((provider) => {
    const id = getProviderId(provider);
    if (seen.has(id)) return;
    seen.add(id);
    options.push({ id, label: getEvmProviderLabel(id) });
  });
  return options;
};

export const getEvmProviderById = (id: EvmProviderId) => {
  const providers = getAllProviders();
  return providers.find((provider) => getProviderId(provider) === id) ?? null;
};

/** Verifica se uma carteira ETH (por id) está instalada no browser. */
export const isEvmWalletAvailable = (id: EvmProviderId): boolean => {
  if (typeof window === "undefined") return false;
  return !!getEvmProviderById(id);
};

export const isMetaMaskAvailable = () => !!getMetaMaskProvider();

export const connectMetaMask = async () => {
  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error("MetaMask não está disponível.");
  }
  if (typeof window !== "undefined") {
    try {
      const current = window as Window & {
        ethereum?: typeof window.ethereum & { providers?: Array<typeof window.ethereum> };
      };
      current.ethereum = provider;
      if (current.ethereum?.providers && Array.isArray(current.ethereum.providers)) {
        current.ethereum.providers = [provider];
      }
    } catch {
      // ignore
    }
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const address = accounts?.[0];
  if (!address) {
    throw new Error("Nenhuma conta retornada pelo MetaMask.");
  }

  return address as `0x${string}`;
};

export const connectEvmProvider = async (provider?: EvmProvider) => {
  if (!provider) {
    throw new Error("Carteira não encontrada.");
  }
  if (typeof window !== "undefined") {
    try {
      const current = window as Window & {
        ethereum?: EvmProvider & { providers?: EvmProvider[] };
      };
      current.ethereum = provider;
      if (current.ethereum?.providers && Array.isArray(current.ethereum.providers)) {
        current.ethereum.providers = [provider];
      }
    } catch {
      // ignore
    }
  }
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts?.[0];
  if (!address) {
    throw new Error("Nenhuma conta retornada pela carteira.");
  }
  return address as `0x${string}`;
};

export const getEthBalance = async (address: `0x${string}`) => {
  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
};

export const getEvmBalance = async (address: `0x${string}`, network: EvmNetwork) => {
  const chain = chainMap[network];
  const client = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
  const balance = await client.getBalance({ address });
  return formatEther(balance);
};
