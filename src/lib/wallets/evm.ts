import { createPublicClient, fallback, formatEther, formatUnits, http } from "viem";
import { arbitrum, avalanche, base, bsc, celo, cronos, fantom, gnosis, linea, mainnet, optimism, polygon, zkSync } from "viem/chains";

const erc20Abi = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
] as const;

// RPCs públicos fiáveis com fallback automático
const ETH_RPCS = [
  "https://ethereum.publicnode.com",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
  "https://eth.drpc.org",
];

const chainRpcs: Record<string, string[]> = {
  Ethereum:       ETH_RPCS,
  Arbitrum:       ["https://arbitrum-one.publicnode.com", "https://arb1.arbitrum.io/rpc", "https://arbitrum.drpc.org", "https://arbitrum-one.drpc.org"],
  Optimism:       ["https://mainnet.optimism.io", "https://optimism.publicnode.com", "https://optimism.drpc.org"],
  Base:           ["https://mainnet.base.org", "https://base.publicnode.com", "https://base.drpc.org"],
  Polygon:        ["https://polygon-rpc.com", "https://polygon-bor.publicnode.com", "https://polygon.drpc.org"],
  BSC:            ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com", "https://bsc.drpc.org"],
  Avalanche:      ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain.publicnode.com", "https://avax.drpc.org"],
  Fantom:         ["https://rpcapi.fantom.network", "https://fantom.publicnode.com", "https://fantom.drpc.org"],
  zkSync:         ["https://mainnet.era.zksync.io", "https://zksync.drpc.org"],
  Linea:          ["https://rpc.linea.build", "https://linea.publicnode.com", "https://linea.drpc.org"],
  Gnosis:         ["https://rpc.gnosischain.com", "https://gnosis.publicnode.com", "https://gnosis.drpc.org"],
  Celo:           ["https://forno.celo.org", "https://celo.publicnode.com"],
  Cronos:         ["https://evm.cronos.org", "https://cronos.publicnode.com"],
  Scroll:         ["https://rpc.scroll.io", "https://scroll.drpc.org"],
  Mantle:         ["https://rpc.mantle.xyz", "https://mantle.drpc.org"],
  Blast:          ["https://rpc.blast.io", "https://blast.drpc.org"],
};

const makeTransport = (urls: string[]) =>
  fallback(urls.map((url) => http(url, { timeout: 8_000 })));

const publicClient = createPublicClient({
  chain: mainnet,
  transport: makeTransport(ETH_RPCS),
});

// Scroll, Mantle, Blast não estão em viem/chains — definimos manualmente
const scroll = { id: 534352, name: "Scroll", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.scroll.io"] } } } as const;
const mantle = { id: 5000, name: "Mantle", nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } } } as const;
const blast = { id: 81457, name: "Blast", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.blast.io"] } } } as const;

const chainMap = {
  Ethereum: mainnet,
  Arbitrum: arbitrum,
  Optimism: optimism,
  Base:     base,
  Polygon:  polygon,
  BSC:      bsc,
  Avalanche: avalanche,
  Fantom:   fantom,
  zkSync:   zkSync,
  Linea:    linea,
  Gnosis:   gnosis,
  Celo:     celo,
  Cronos:   cronos,
  Scroll:   scroll,
  Mantle:   mantle,
  Blast:    blast,
};

export type EvmNetwork = keyof typeof chainMap;

export type EvmProviderId = "metamask" | "coinbase" | "trust" | "binance" | "rainbow" | "okx" | "bybit" | "rabby" | "unknown";

type EvmProvider = typeof window.ethereum;

const isMetaMaskProvider = (provider?: EvmProvider) =>
  !!provider && !!provider.isMetaMask && !("isPhantom" in provider);

const getProviderId = (provider?: EvmProvider): EvmProviderId => {
  if (!provider) return "unknown";
  if ("isRabby" in provider) return "rabby";
  if ("isRainbow" in provider) return "rainbow";
  if ("isOkxWallet" in provider || "isOKExWallet" in provider) return "okx";
  if ("isBybit" in provider || "isBitKeep" in provider) return "bybit";
  if ("isCoinbaseWallet" in provider) return "coinbase";
  if ("isTrust" in provider || "isTrustWallet" in provider) return "trust";
  if ("isBinanceChain" in provider || "isBinance" in provider) return "binance";
  if (provider.isMetaMask && !("isPhantom" in provider)) return "metamask";
  return "unknown";
};

export const getEvmProviderLabel = (id: EvmProviderId) => {
  switch (id) {
    case "metamask": return "MetaMask";
    case "coinbase":  return "Coinbase Wallet";
    case "trust":     return "Trust Wallet";
    case "binance":   return "Binance Chain Wallet";
    case "rainbow":   return "Rainbow Wallet";
    case "okx":       return "OKX Wallet";
    case "bybit":     return "Bybit Wallet";
    case "rabby":     return "Rabby Wallet";
    default:          return "Carteira EVM";
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

export const switchEvmNetwork = async (provider: EvmProvider, network: EvmNetwork) => {
  if (!provider || network === "Ethereum") return;
  const chain = chainMap[network];
  const chainIdHex = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (err: unknown) {
    // 4902 = chain not added to wallet
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 4902) {
      const rpcs = chainRpcs[network] ?? [chain.rpcUrls.default.http[0]];
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chainIdHex,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: rpcs,
          blockExplorerUrls: ("blockExplorers" in chain && chain.blockExplorers)
            ? [Object.values(chain.blockExplorers as Record<string, { url: string }>)[0]?.url]
            : undefined,
        }],
      });
    } else {
      throw err;
    }
  }
};

export const getEthBalance = async (address: `0x${string}`) => {
  const balance = await publicClient.getBalance({ address });
  return formatEther(balance);
};

export const getEvmBalance = async (address: `0x${string}`, network: EvmNetwork) => {
  const chain = chainMap[network];
  const rpcs = chainRpcs[network] ?? [chain.rpcUrls.default.http[0]];
  const client = createPublicClient({
    chain,
    transport: makeTransport(rpcs),
  });
  const balance = await client.getBalance({ address });
  return formatEther(balance);
};

/** Endereços dos contratos ERC20 (Ethereum mainnet) para stablecoins. */
export const STABLECOIN_TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`,
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as `0x${string}`,
  BUSD: "0x4Fabb145d64652a948d72533023f6E7A623C7C53" as `0x${string}`,
  TUSD: "0x0000000000085d4780B73119b644AE5ecd22b376" as `0x${string}`,
};

/** Conecta via WalletConnect v2 (QR code — funciona com qualquer carteira mobile). */
export const connectWalletConnect = async (): Promise<`0x${string}`> => {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID não configurado.");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const provider = await EthereumProvider.init({
    projectId,
    chains: [1],
    optionalChains: [137, 42161, 10, 8453, 56],
    showQrModal: true,
    metadata: {
      name: "Fundo Coruja",
      description: "Gestor de portfólio multi-chain",
      url: typeof window !== "undefined" ? window.location.origin : "https://owlfund.app",
      icons: ["/owlfund-owl.png"],
    },
  });
  await provider.connect();
  const accounts = provider.accounts;
  if (!accounts?.[0]) throw new Error("Nenhuma conta retornada pelo WalletConnect.");
  return accounts[0] as `0x${string}`;
};

/** Saldo de um token ERC20 por rede. Só suportado em Ethereum para as stablecoins conhecidas; outras redes devolvem "0". */
export const getEvmTokenBalance = async (
  ownerAddress: `0x${string}`,
  tokenSymbol: string,
  network: EvmNetwork
): Promise<string> => {
  const tokenAddress = STABLECOIN_TOKEN_ADDRESSES[tokenSymbol.toUpperCase()];
  if (!tokenAddress || network !== "Ethereum") return "0";
  const chain = chainMap[network];
  const client = createPublicClient({
    chain,
    transport: makeTransport(chainRpcs[network] ?? [chain.rpcUrls.default.http[0]]),
  });
  try {
    const [balance, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [ownerAddress] }),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return formatUnits(balance, decimals);
  } catch {
    return "0";
  }
};
