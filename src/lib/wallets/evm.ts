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

export const isMetaMaskAvailable = () =>
  typeof window !== "undefined" && !!window.ethereum?.isMetaMask;

export const connectMetaMask = async () => {
  if (!window.ethereum) {
    throw new Error("MetaMask não está disponível.");
  }

  const accounts = (await window.ethereum.request({
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
