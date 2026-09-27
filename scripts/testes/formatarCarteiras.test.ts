import {
  defiKey, ethBalanceKey, fiatValue, formatAddress, formatRuneAmount, networkToMoralisChain, normalizeChain,
  propsDefiNftCartao, removeWallet, upsertWallet, type DefiNftMaps,
} from "@/lib/wallets/formatar";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`); };

// Chaves (formato usado nos mapas de estado — mudar parte os dados guardados)
eq("defiKey", defiKey("0xabc", "eth"), "0xabc:eth");
eq("ethBalanceKey", ethBalanceKey("0xabc", "Base"), "0xabc-Base");

// Endereco encurtado
eq("formatAddress vazio", formatAddress(undefined), "—");
eq("formatAddress curto fica", formatAddress("abc123"), "abc123");
eq("formatAddress 12 fica", formatAddress("123456789012"), "123456789012");
eq("formatAddress longo", formatAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), "0x742d...f44e");

// Lista de carteiras
const lista = [{ address: "a", network: "Ethereum" }, { address: "b", network: "Base", label: "x" }];
eq("removeWallet", removeWallet(lista, (w) => w.address === "a"), [{ address: "b", network: "Base", label: "x" }]);
eq("removeWallet nao muda o original", lista.length, 2);
eq("upsertWallet novo vai para o fim", upsertWallet(lista, { address: "c" }, (w) => w.address === "c").map((w) => w.address), ["a", "b", "c"]);
eq("upsertWallet junta campos", upsertWallet(lista, { address: "b", balance: "1" }, (w) => w.address === "b")[1], { address: "b", network: "Base", label: "x", balance: "1" });

// Runes
eq("runes 4 casas", formatRuneAmount(1234.56789, "en-US"), "1,234.5679");
eq("runes texto", formatRuneAmount("2.5", "en-US"), "2.5");
eq("runes enorme fica como veio", formatRuneAmount("123456789012345678", "en-US"), "123456789012345678");
eq("runes lixo = 0", formatRuneAmount("abc", "en-US"), "0");

// Valor em USD
const precos = { ETH: { priceUsd: 2000 }, BAD: { priceUsd: NaN } };
eq("fiat ETH", fiatValue(precos, "ETH", "1.5"), 3000);
eq("fiat sem preco", fiatValue(precos, "SOL", "1"), null);
eq("fiat preco NaN", fiatValue(precos, "BAD", "1"), null);
eq("fiat saldo nao numero", fiatValue(precos, "ETH", "—"), null);
eq("fiat saldo vazio = 0", fiatValue(precos, "ETH", null), 0);

// Redes
eq("moralis Base", networkToMoralisChain("Base"), "base");
eq("moralis desconhecida -> eth", networkToMoralisChain("Scroll"), "eth");
eq("normalize Ethereum", normalizeChain("Ethereum"), "eth");
eq("normalize SOL", normalizeChain("SOL"), "sol");

// Props de DeFi/NFT do cartao
const maps: DefiNftMaps = {
  defiTotals: { "0xa:eth": 12 }, defiLoading: { "0xa:eth": true }, defiPartial: {}, defiErrors: { "0xa:eth": "x" },
  nftCounts: { "0xa:eth": 3 }, nftLoading: {}, nftErrors: {}, nftsByKey: { "0xa:eth": [{ id: "1", name: "n" }] }, nftPartial: {},
};
eq("cartao com endereco", propsDefiNftCartao(maps, "0xa", "eth"), {
  defiBalanceUsd: 12, defiPartial: false, defiLoading: true, defiError: "x",
  nftCount: 3, nftLoading: false, nftError: null, nfts: [{ id: "1", name: "n" }],
});
eq("cartao sem endereco", propsDefiNftCartao(maps, undefined, "eth"), {
  defiBalanceUsd: null, defiPartial: false, defiLoading: false, defiError: null,
  nftCount: null, nftLoading: false, nftError: null, nfts: [],
});
eq("cartao outra cadeia", propsDefiNftCartao(maps, "0xa", "sol").defiBalanceUsd, null);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
