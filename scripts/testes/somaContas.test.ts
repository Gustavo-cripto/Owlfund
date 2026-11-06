// Vista "Todas": exchanges e DeFi repetidos entre portefólios contam uma vez.
import { somarDefi, somarExchanges } from "@/lib/wallets/somaContas";
import { juntarContas, totaisPartilhados } from "@/lib/api/walletBlob";
let fails = 0;
const eq = (n: string, got: unknown, want: unknown) => { const c = got === want; if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}: ${String(got)}${c ? "" : ` (esperado ${String(want)})`}`); };

eq("mesma exchange em 2 portefólios (gravações antigas)", somarExchanges([{ cexUsd: 10000 }, { cexUsd: 10000 }]), 10000);
eq("corretoras à mão somam-se", somarExchanges([{ cexUsd: 10500, venueUsd: 500 }, { cexUsd: 10200, venueUsd: 200 }]), 10700);
eq("a leitura mais recente manda", somarExchanges([{ cexUsd: 10000, cexEm: 1 }, { cexUsd: 0, cexEm: 2 }]), 0);
eq("sem nenhum valor fica por dizer", somarExchanges([{}, {}]), undefined);
eq("só um portefólio", somarExchanges([{ cexUsd: 5 }]), 5);

const pos = (usd: number) => [{ name: "x", usd }];
eq("carteiras diferentes somam", somarDefi([{ defiUsd: 100, defiPosicoes: { "0xa:eth": pos(100) } }, { defiUsd: 50, defiPosicoes: { "0xb:eth": pos(50) } }]), 150);
eq("a mesma carteira conta uma vez", somarDefi([{ defiUsd: 100, defiPosicoes: { "0xA:eth": pos(100) } }, { defiUsd: 100, defiPosicoes: { "0xa:eth": pos(100) } }]), 100);
eq("repetida ao lado de outra", somarDefi([{ defiUsd: 100, defiPosicoes: { "0xa:eth": pos(100) } }, { defiUsd: 130, defiPosicoes: { "0xa:eth": pos(100), "0xb:eth": pos(30) } }]), 130);
eq("sem posições soma como antes", somarDefi([{ defiUsd: 10 }, { defiUsd: 5 }]), 15);

const conta = (snap: unknown) => ({ "portfolio-wallets": JSON.stringify(snap) });
const blob = { v: 3, registry: { accounts: [], activeId: "a" }, data: { a: conta({ cexUsd: 1000, defiUsd: 7 }), b: conta({ cexUsd: 1000, defiUsd: 3 }) } };
eq("API: exchanges uma vez", totaisPartilhados(blob).cexUsd, 1000);
eq("API: DeFi soma", totaisPartilhados(blob).defiUsd, 10);
eq("juntarContas continua a somar o resto", juntarContas([{ accountId: "a", name: null, wallets: { manualEur: 1 } }, { accountId: "b", name: null, wallets: { manualEur: 2 } }]).manualEur, 3);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`);
process.exit(fails ? 1 : 0);
