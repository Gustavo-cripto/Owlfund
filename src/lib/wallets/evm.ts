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

const getMetaMaskProvider = () => {
  if (typeof window === "undefined") return null;
  const ethereum = window.ethereum as
    | (typeof window.ethereum & { providers?: Array<typeof window.ethereum> })
    | undefined;
  if (!ethereum) return null;
  if (ethereum.isMetaMask) return ethereum;
  const providers = Array.isArray(ethereum.providers) ? ethereum.providers : [];
  return providers.find((provider) => provider?.isMetaMask) ?? null;
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
