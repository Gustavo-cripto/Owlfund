// "Que chaves apagar de cada mapa" ao remover uma carteira (src/lib/wallets/remover.ts).
import { remocaoEth, remocaoPorEndereco, remocaoSol, semChave } from "@/lib/wallets/remover";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`); };

// semChave
const mapa = { a: "1", b: "2" };
const semA = semChave(mapa, "a");
eq("semChave apaga a chave", semA, { b: "2" });
eq("semChave nao muda o original", mapa, { a: "1", b: "2" });
const semZ = semChave(mapa, "z");
eq("semChave sem a chave: mesmo conteudo", semZ, mapa);
eq("semChave devolve sempre objeto novo (o setState volta a desenhar, como antes)", semZ !== mapa, true);
eq("semChave chave vazia", semChave({ "": true, x: false }, ""), { x: false });

// Ethereum: endereco + rede
const eth = [
  { address: "0xA", network: "Ethereum" },
  { address: "0xA", network: "Base" },
  { address: "0xB", network: "Ethereum" },
];
const r1 = remocaoEth(eth, { address: "0xA", network: "Base" }, "0xA");
eq("eth remove so a rede certa", r1.nextWallets, [{ address: "0xA", network: "Ethereum" }, { address: "0xB", network: "Ethereum" }]);
eq("eth Base nao e a ligada", r1.eraLigada, false);
eq("eth chave endereco-rede", r1.chave, "0xA-Base");
const r2 = remocaoEth(eth, { address: "0xA", network: "Ethereum" }, "0xA");
eq("eth mainnet com o mesmo endereco e a ligada", [r2.eraLigada, r2.chave, r2.nextWallets.length], [true, "0xA-Ethereum", 2]);
eq("eth ligada noutro endereco", remocaoEth(eth, { address: "0xB", network: "Ethereum" }, "0xA").eraLigada, false);
eq("eth sem endereco/rede", remocaoEth(eth, {}, undefined), { nextWallets: eth, eraLigada: false, chave: "-" });
eq("eth nao muda a lista original", eth.length, 3);

// Solana: rede em falta conta como "Solana"
const sol = [{ address: "S1" }, { address: "S1", network: "Solana Devnet" }, { address: "S2", network: "Solana" }];
const s1 = remocaoSol(sol, { address: "S1", network: "Solana" }, "S2");
eq("sol rede em falta = Solana", s1.nextWallets, [{ address: "S1", network: "Solana Devnet" }, { address: "S2", network: "Solana" }]);
eq("sol chave = endereco; ligada?", [s1.chave, s1.eraLigada], ["S1", false]);
eq("sol ligada", remocaoSol(sol, { address: "S2" }, "S2").eraLigada, true);
eq("sol sem endereco = chave vazia", remocaoSol(sol, {}, "S2").chave, "");

// Bitcoin/Cardano: pelo endereco, em todas as redes
const btc = [{ address: "bc1", network: "Bitcoin" }, { address: "bc1", network: "Liquid" }, { address: "bc2" }];
const b1 = remocaoPorEndereco(btc, { address: "bc1", network: "Liquid" }, "bc1");
eq("btc remove todas as redes do endereco", b1.nextWallets, [{ address: "bc2" }]);
eq("btc chave e ligada", [b1.chave, b1.eraLigada], ["bc1", true]);
eq("ada sem ligada", remocaoPorEndereco([{ address: "addr1" }], { address: "addr1" }, undefined), { nextWallets: [], eraLigada: false, chave: "addr1" });

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
