// Props dos quatro WalletCard (src/lib/wallets/cartoes.ts): as mesmas props, pela
// mesma ordem e com os mesmos valores que estavam no JSX da pagina.
import { propsCartaoAda, propsCartaoBtc, propsCartaoEth, propsCartaoSol } from "@/lib/wallets/cartoes";
import type { DefiNftMaps } from "@/lib/wallets/formatar";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`); };

const vazio: DefiNftMaps = { defiTotals: {}, defiLoading: {}, defiPartial: {}, defiErrors: {}, nftCounts: {}, nftLoading: {}, nftErrors: {}, nftsByKey: {}, nftPartial: {} };
const cheio: DefiNftMaps = {
  ...vazio,
  defiTotals: { "0xAAAAAAAAAAAAAAAAAAAA:eth": 12 },
  nftCounts: { "0xAAAAAAAAAAAAAAAAAAAA:eth": 3 },
  defiLoading: { "0xAAAAAAAAAAAAAAAAAAAA:eth": true },
};
const precos: Record<string, number> = { ETH: 2000, SOL: 100, BTC: 50000, ADA: 0.5 };
const getFiatValue = (symbol: string, v?: string | number | null) => (v == null ? null : Number(v) * (precos[symbol] ?? 0));
const t = (k: string) => (k === "wl_networks_n" ? "{n} redes" : k);
const noop = () => {};
const chamadas: string[] = [];
let mostrar = false;
const setShow = (f: boolean | ((p: boolean) => boolean)) => { mostrar = typeof f === "function" ? f(mostrar) : f; };

const DEFI_NFT = ["defiBalanceUsd", "defiPartial", "defiLoading", "defiError", "nftCount", "nftLoading", "nftError", "nfts", "defiPosicoes"];
const FIM = ["usdToEur"];

// ── Ethereum
const ethBase = {
  t, ethWallets: [] as { address?: string; network?: string; balance?: string }[], selectedEthConnectNetwork: "Ethereum" as const,
  ethActiveEntry: null, ethAddress: undefined as string | undefined, ethShowMain: false, ethActiveBalance: null as string | null,
  getFiatValue, defiNftMaps: vazio, ethMainAddress: undefined as string | undefined, usdToEurRate: 0.9,
  fetchDefiTotal: async (a: string, c: string) => { chamadas.push(`${a}:${c}`); },
  ethIsAvailable: false, ethLoading: false, ethError: null, handleEthConnect: noop, handleEthDisconnect: noop,
  handleEthRefresh: noop, setEthShowMain: setShow,
};
const e0 = propsCartaoEth(ethBase);
eq("eth ordem das props", Object.keys(e0), ["title", "description", "address", "addressDisplay", "balance", "balanceUnit", "fiatValueUsd", ...DEFI_NFT, ...FIM, "onRefreshDefi", "isConnected", "isAvailable", "isLoading", "error", "onConnect", "onConnectAnother", "onDisconnect", "onRefresh", "onToggleAddress", "isAddressVisible"]);
eq("eth sem carteiras", [e0.description, e0.address, e0.addressDisplay, e0.balance, e0.fiatValueUsd, e0.isConnected, e0.isAvailable], ["MetaMask (ETH)", undefined, "—", null, null, false, false]);
eq("eth sem endereco = DeFi/NFT vazios", [e0.defiBalanceUsd, e0.defiLoading, e0.nftCount, e0.nfts, e0.onRefreshDefi], [null, false, null, [], undefined]);
eq("eth ligar = ligar outra", e0.onConnect === e0.onConnectAnother, true);
const addr = "0xAAAAAAAAAAAAAAAAAAAA";
const e1 = propsCartaoEth({
  ...ethBase, ethWallets: [{ address: addr, network: "Base" }, { address: "0xB", network: "Ethereum" }],
  selectedEthConnectNetwork: "Base" as never, ethMainAddress: addr, defiNftMaps: cheio, ethActiveBalance: "0.5",
});
eq("eth descricao com rede", e1.description, "Base · 2 redes");
eq("eth endereco = 1.a carteira", [e1.address, e1.addressDisplay], [addr, "0xAAAA...AAAA"]);
eq("eth DeFi/NFT do principal", [e1.defiBalanceUsd, e1.defiLoading, e1.nftCount], [12, true, 3]);
eq("eth fiat do saldo ativo", e1.fiatValueUsd, 1000);
eq("eth ligado so com lista", [e1.isConnected, e1.isAvailable], [true, true]);
e1.onRefreshDefi?.();
eq("eth atualizar DeFi chama o principal", chamadas, [`${addr}:eth`]);
const e2 = propsCartaoEth({ ...ethBase, ethWallets: [{ address: "0xB", network: "Ethereum" }], ethActiveEntry: { address: "0xC", network: "Ethereum" } as never, ethAddress: "0xD", ethShowMain: true });
eq("eth entrada ativa ganha ao ligado; visivel = completo", [e2.address, e2.addressDisplay, e2.description], ["0xC", "0xC", "ETH Mainnet · 1 redes"]);
e2.onToggleAddress();
eq("eth alternar endereco", mostrar, true);
e2.onToggleAddress();
eq("eth alternar outra vez", mostrar, false);

// ── Solana
const solBase = {
  solWallets: [] as { address?: string }[], solAddress: undefined as string | undefined, solShowMain: false, totalSolBalance: "0.0000",
  solBalance: undefined as string | undefined, getFiatValue, defiNftMaps: vazio, solMainAddress: undefined as string | undefined,
  usdToEurRate: 0.9, fetchDefiTotal: async () => {}, solIsAvailable: false, solLoading: false, solError: null,
  handleSolConnect: noop, handleSolDisconnect: noop, handleSolRefresh: noop, setSolShowMain: setShow,
};
const s0 = propsCartaoSol(solBase);
eq("sol ordem das props", Object.keys(s0), ["title", "description", "address", "addressDisplay", "balance", "balanceUnit", "fiatValueUsd", ...DEFI_NFT, ...FIM, "onRefreshDefi", "isConnected", "isAvailable", "isLoading", "error", "onConnect", "onConnectAnother", "onDisconnect", "onRefresh", "onToggleAddress", "isAddressVisible"]);
eq("sol sem carteiras usa saldo ligado", [s0.description, s0.balance, s0.fiatValueUsd], ["Phantom (SOL)", undefined, null]);
const s1 = propsCartaoSol({ ...solBase, solWallets: [{ address: "So1" }, { address: "So2" }], totalSolBalance: "2.5000", solBalance: "1", solAddress: "SoLigado" });
eq("sol com carteiras usa o total", [s1.description, s1.balance, s1.fiatValueUsd, s1.address, s1.isConnected], ["2 carteira(s) · Saldo total SOL", "2.5000", 250, "SoLigado", true]);

// ── Bitcoin
const btcBase = {
  btcWallets: [] as { address?: string }[], selectedBtcProvider: "electrum" as const, btcAddress: undefined as string | undefined,
  btcShowMain: false, totalBtcBalance: "0.00000000", btcBalance: null as number | null, getFiatValue, defiNftMaps: vazio,
  btcMainAddress: undefined as string | undefined, usdToEurRate: 0.9, btcIsAvailable: false, btcLoading: false, btcError: null,
  handleBtcConnect: noop, handleBtcDisconnect: noop, handleBtcRefresh: noop, setBtcShowMain: setShow,
};
const b0 = propsCartaoBtc(btcBase);
eq("btc ordem das props", Object.keys(b0), ["title", "description", "address", "addressDisplay", "balance", "balanceUnit", "fiatValueUsd", "hideDefi", ...DEFI_NFT, ...FIM, "isConnected", "isAvailable", "isLoading", "error", "onConnect", "onConnectAnother", "onDisconnect", "onRefresh", "allowConnectWhenUnavailable", "onToggleAddress", "isAddressVisible"]);
eq("btc descricao da carteira escolhida", b0.description, "Electrum (BTC)");
eq("btc sem saldo", [b0.balance, b0.fiatValueUsd, b0.hideDefi, b0.allowConnectWhenUnavailable], [null, null, true, true]);
const b1 = propsCartaoBtc({ ...btcBase, btcBalance: 0.1 });
eq("btc saldo ligado com 8 casas", [b1.balance, b1.fiatValueUsd], ["0.10000000", 5000]);
const b2 = propsCartaoBtc({ ...btcBase, btcWallets: [{ address: "bc1x" }], totalBtcBalance: "0.20000000", btcIsAvailable: false });
eq("btc com carteiras: total; disponivel so pela extensao", [b2.balance, b2.isConnected, b2.isAvailable], ["0.20000000", true, false]);

// ── Cardano
const adaBase = {
  adaWallets: [] as { address?: string }[], selectedAdaProvider: "desconhecida" as never, adaAddress: undefined as string | undefined,
  adaShowMain: false, totalAdaBalance: "0.000000", adaBalance: undefined as string | undefined, getFiatValue, defiNftMaps: vazio,
  adaMainAddress: undefined as string | undefined, usdToEurRate: 0.9, adaIsAvailable: false, adaLoading: true,
  adaLoadingMsg: "a ler" as string | undefined, adaError: null, handleAdaConnect: noop, handleAdaDisconnect: noop,
  handleAdaRefresh: noop, setAdaShowMain: setShow,
};
const a0 = propsCartaoAda(adaBase);
eq("ada ordem das props", Object.keys(a0), ["title", "description", "address", "addressDisplay", "balance", "balanceUnit", "fiatValueUsd", ...DEFI_NFT, ...FIM, "isConnected", "isAvailable", "isLoading", "loadingMessage", "error", "onConnect", "onConnectAnother", "onDisconnect", "onRefresh", "onToggleAddress", "isAddressVisible"]);
eq("ada carteira desconhecida cai em Eternl", a0.description, "Eternl (ADA)");
eq("ada mensagem de carregamento", [a0.isLoading, a0.loadingMessage], [true, "a ler"]);
const a1 = propsCartaoAda({ ...adaBase, adaWallets: [{ address: "addr1" }], totalAdaBalance: "10.000000" });
eq("ada com carteiras", [a1.description, a1.balance, a1.fiatValueUsd, a1.isAvailable], ["1 carteira(s) · Saldo total ADA", "10.000000", 5, true]);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
