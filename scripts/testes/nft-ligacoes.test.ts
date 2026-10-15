import { ligacoesNft } from "@/lib/nft/ligacoes";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${String(got)}${ok ? "" : ` (esperado ${String(want)})`}`);
};
const c = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
const eth = ligacoesNft({ tokenAddress: c, tokenId: "42" }, "Ethereum");
eq("eth explorador", eth.explorador, `https://etherscan.io/nft/${c}/42`);
eq("eth opensea", eth.mercado, `https://opensea.io/assets/ethereum/${c}/42`);
eq("eth tipo", eth.tipo, "contrato");
eq("eth página do contrato", eth.contrato, `https://etherscan.io/address/${c}`);
const base = ligacoesNft({ tokenAddress: c, tokenId: "7" }, "Base");
eq("base explorador (não etherscan)", base.explorador, `https://basescan.org/nft/${c}/7`);
eq("base opensea", base.mercado, `https://opensea.io/assets/base/${c}/7`);
eq("cadeia curta eth", ligacoesNft({ tokenAddress: c, tokenId: "1" }, "eth").rede, "Ethereum");
eq("sem tokenId → só o contrato", ligacoesNft({ tokenAddress: c }, "Ethereum").explorador, null);
eq("sem tokenId → contrato", ligacoesNft({ tokenAddress: c }, "Ethereum").contrato, `https://etherscan.io/address/${c}`);
eq("sol mint", ligacoesNft({ tokenAddress: "Mint111" }, "sol").explorador, "https://solscan.io/token/Mint111");
eq("btc inscrição", ligacoesNft({ tokenAddress: "abci0" }, "Bitcoin").explorador, "https://ordinals.com/inscription/abci0");
const unit = "a".repeat(56) + "4e4654";
eq("ada policy", ligacoesNft({ tokenAddress: unit }, "ada").id, "a".repeat(56));
eq("sem endereço", ligacoesNft({}, "Ethereum").explorador, null);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
