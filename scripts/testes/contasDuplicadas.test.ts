// "Conta 1" duplicadas: só sai a que está toda contida noutra "Conta 1".
import { cobre, contasRedundantes, identidades, type ContaParaDedupe, type Conteudo } from "@/lib/portfolios/duplicados";
import { getRegistry, juntarRegistoDaNuvem, writeNamespaced } from "@/lib/portfolios/accounts";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

const W = (ends: string[], extra: Record<string, unknown> = {}) => JSON.stringify({ eth: ends.map((a) => ({ address: a, network: "Ethereum", balance: "1" })), cexUsd: 0, ...extra });
const c = (o: Record<string, string>): Conteudo => Object.fromEntries(Object.entries(o).map(([b, r]) => [b, identidades(b, r)]));
const conta = (id: string, name: string, dados: Record<string, string>, o: Partial<ContaParaDedupe> = {}): ContaParaDedupe =>
  ({ id, name, ativa: false, naNuvem: true, possivel: c(dados), final: c(dados), ...o });

// identidades
ok("carteira EVM ignora maiúsculas e saldo", [...identidades("portfolio-wallets", W(["0xAbC"]))][0] === [...identidades("portfolio-wallets", JSON.stringify({ eth: [{ address: "0xabc", network: "Ethereum", balance: "9" }] }))][0]);
ok("totais a 0 não são identidade", identidades("portfolio-wallets", '{"cexUsd":0,"defiUsd":5}').size === 0);
ok("trades: lápides não contam", identidades("trade-history-v1", '[{"id":"a"},{"id":"b","deleted":true}]').size === 1);
ok("ativo manual com quantidades diferentes é diferente", !cobre(c({ "owlfund.crypto.holdings.v1": '{"BTC":{"quantity":2}}' }), c({ "owlfund.crypto.holdings.v1": '{"BTC":{"quantity":1}}' })));
ok("JSON ilegível só é igual a si próprio", !cobre(c({ x: "{a" }), c({ x: "{b" })) && cobre(c({ x: "{a" }), c({ x: "{a" })));

// o caso real: 4 "Conta 1" com as mesmas 5 carteiras, uma com trades, e contas com nome
const cinco = ["0x1", "0x2", "0x3", "0x4", "0x5"];
const T = '[{"id":"t1","asset":"BTC"}]';
let r = contasRedundantes([
  conta("trades", "Conta 1", { "portfolio-wallets": W(cinco), "trade-history-v1": T }),
  conta("gt1", "GT 1", { "portfolio-wallets": W(["0x1", "0x2", "0x3", "0x4"]) }),
  conta("dup1", "Conta 1", { "portfolio-wallets": W(cinco) }),
  conta("ativa", "Conta 1", { "portfolio-wallets": W(cinco) }, { ativa: true }),
  conta("so-trades", "Conta 1", { "trade-history-v1": T }),
  conta("gt2", "Gt2", {}),
  conta("conta3", "Conta 3", { "portfolio-wallets": W(["0x1", "0x2", "0x3", "0x4"]) }),
  conta("quatro", "Conta 1", { "portfolio-wallets": W(["0x1", "0x2", "0x3", "0x4"]) }),
  conta("trad", "Conta 1", { "portfolio-wallets": W(["0x1", "0x2", "0x3", "0x4"]), "owlfund.traditional.holdings.v1": '{"vwce":{"quantity":3}}', "trade-history-v1": T }),
]).sort();
ok("saem as duplicadas puras (incl. a ativa, coberta pela que tem trades)", r.join() === ["ativa", "dup1", "quatro", "so-trades"].sort().join(), r.join());
ok("ficam as com nome próprio, mesmo vazias ou repetidas", !r.includes("gt1") && !r.includes("gt2") && !r.includes("conta3"));
ok("fica a que tem algo único (tradicionais)", !r.includes("trad"));

// iguais: fica a da nuvem, depois a ativa
r = contasRedundantes([conta("local", "Conta 1", { "portfolio-wallets": W(["0x1"]) }, { ativa: true, naNuvem: false }), conta("nuvem", "Conta 1", { "portfolio-wallets": W(["0x1"]) })]);
ok("entre iguais fica a da nuvem", r.join() === "local", r.join());
r = contasRedundantes([conta("a", "Conta 1", { "portfolio-wallets": W(["0x1"]) }), conta("b", "Conta 1", { "portfolio-wallets": W(["0x1"]) }, { ativa: true })]);
ok("entre iguais na nuvem fica a ativa", r.join() === "a", r.join());

// carteiras diferentes: ninguém sai
r = contasRedundantes([conta("a", "Conta 1", { "portfolio-wallets": W(["0x1"]) }), conta("b", "Conta 1", { "portfolio-wallets": W(["0x2"]) })]);
ok("carteiras diferentes: ficam as duas", r.length === 0);

// a guardiã tem de cobrir com o que vai TER (final), não com o que podia ter
r = contasRedundantes([
  conta("x", "Conta 1", { "portfolio-wallets": W(["0x1"]) }),
  conta("k", "Conta 1", { "portfolio-wallets": W(["0x1", "0x2"]) }, { final: c({ "portfolio-wallets": W(["0x2"]) }) }),
]);
ok("se a outra vai perder a carteira no merge, esta não sai", !r.includes("x"), r.join());

// uma só Conta 1 com dados e contas com nome: nada sai
ok("Conta 1 única com dados fica", contasRedundantes([conta("a", "Conta 1", { "portfolio-wallets": W(["0x1"]) }), conta("p", "Poupança", {})]).length === 0);

// integração com o registo (localStorage a fingir)
const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
(globalThis as unknown as Record<string, unknown>).window = { localStorage, dispatchEvent: () => true };
writeNamespaced("velha", "portfolio-wallets", W(cinco));
store.set("cf.accounts.v1", JSON.stringify({ accounts: [{ id: "velha", name: "Conta 1" }], activeId: "velha" }));
const fora = juntarRegistoDaNuvem(
  { accounts: [{ id: "real", name: "Conta 1" }, { id: "velha", name: "Conta 1" }, { id: "gt", name: "GT 1" }], activeId: "velha" },
  { real: { "portfolio-wallets": W(cinco), "trade-history-v1": T }, velha: { "portfolio-wallets": W(cinco) }, gt: { "portfolio-wallets": W(["0x9"]) } },
);
const reg = getRegistry();
ok("registo: a duplicada ativa sai e a ativa passa para a Conta 1 que fica", fora.join() === "velha" && reg.activeId === "real" && reg.accounts.map((a) => a.id).join() === "real,gt", JSON.stringify(reg));
ok("registo: dados locais da duplicada apagados", localStorage.getItem("cf.acct.velha.portfolio-wallets") === null);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
