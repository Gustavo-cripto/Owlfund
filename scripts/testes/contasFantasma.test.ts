// Aparelho novo: a "Conta 1" vazia criada antes de a nuvem responder não pode
// ficar ativa nem ir para a nuvem (auditoria 28 set 2026).
import { contaVazia, ensureAccounts, getRegistry, juntarRegistoDaNuvem, temConteudo, writeNamespaced, ALL_ACCOUNTS_ID, setActiveAccountId } from "@/lib/portfolios/accounts";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

const store = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
const g = globalThis as unknown as Record<string, unknown>;
g.window = { localStorage, dispatchEvent: () => true };
const limpar = () => store.clear();

ok("'{}' não é conteúdo", !temConteudo("{}"));
ok("'[]' não é conteúdo", !temConteudo("[]"));
ok("zeros não são conteúdo", !temConteudo('{"cexUsd":0,"defiUsd":0,"eth":[]}'));
ok("uma carteira é conteúdo", temConteudo('{"eth":[{"address":"0xabc"}]}'));
ok("um valor é conteúdo", temConteudo('{"manualEur":12.5}'));
ok("null não é conteúdo", !temConteudo(null));

const CARTEIRA = JSON.stringify({ eth: [{ address: "0xabc", balance: "1.0" }] });
const nuvem = { accounts: [{ id: "real", name: "Conta 1" }, { id: "poup", name: "Poupança" }], activeId: "real" };
const dados = { real: { "portfolio-wallets": CARTEIRA } };

// 1) Aparelho novo, AccountSwitcher já criou a fantasma e gravou zeros nela.
limpar();
const fantasma = ensureAccounts().activeId;
writeNamespaced(fantasma, "portfolio-wallets", '{"cexUsd":0,"tokensUsd":0}');
writeNamespaced(fantasma, "owlfund.sync.ts.v1", '{"portfolio-wallets":123}');
ok("a fantasma é vazia (carimbos não contam)", contaVazia(fantasma));
let fora = juntarRegistoDaNuvem(nuvem, dados);
let reg = getRegistry();
ok("fantasma removida", fora.includes(fantasma) && !reg.accounts.some((a) => a.id === fantasma));
ok("ativa passa a ser a da nuvem", reg.activeId === "real", reg.activeId);
ok("contas da nuvem ficam (mesmo a vazia com nome próprio)", reg.accounts.map((a) => a.id).join() === "real,poup");
ok("chaves da fantasma apagadas", localStorage.getItem(`cf.acct.${fantasma}.portfolio-wallets`) === null);

// 2) Aparelho novo sem registo nenhum: adota a nuvem sem criar nada.
limpar();
juntarRegistoDaNuvem(nuvem, dados);
reg = getRegistry();
ok("sem registo local: fica só a nuvem", reg.accounts.length === 2 && reg.activeId === "real");

// 3) Fantasma que JÁ está na nuvem (enviada por outro aparelho) sai também.
limpar();
const suja = { accounts: [{ id: "real", name: "Conta 1" }, { id: "f1", name: "Conta 1" }], activeId: "f1" };
fora = juntarRegistoDaNuvem(suja, { real: { "portfolio-wallets": CARTEIRA }, f1: { "portfolio-wallets": '{"defiUsd":0}' } });
reg = getRegistry();
ok("fantasma da nuvem removida", fora.join() === "f1" && reg.accounts.length === 1 && reg.activeId === "real");

// 4) "Conta 1" local COM dados e fora da nuvem (usou o site antes de haver nuvem): fica.
limpar();
const minha = ensureAccounts().activeId;
writeNamespaced(minha, "portfolio-wallets", CARTEIRA);
juntarRegistoDaNuvem({ accounts: [{ id: "poup", name: "Poupança" }], activeId: "poup" }, {});
reg = getRegistry();
ok("conta local com dados fica e continua ativa", reg.accounts.some((a) => a.id === minha) && reg.activeId === minha);

// 5) Utilizador novo sem nada em lado nenhum: fica com UMA conta.
limpar();
ensureAccounts();
juntarRegistoDaNuvem({ accounts: [{ id: "n1", name: "Conta 1" }], activeId: "n1" }, {});
reg = getRegistry();
ok("tudo vazio: fica uma só, a da nuvem", reg.accounts.length === 1 && reg.accounts[0].id === "n1");

// 6) Vista "Todas" mantém-se.
limpar();
juntarRegistoDaNuvem(nuvem, dados);
setActiveAccountId(ALL_ACCOUNTS_ID);
juntarRegistoDaNuvem(nuvem, dados);
ok("vista Todas mantém-se", getRegistry().activeId === ALL_ACCOUNTS_ID);

// 7) Conta vazia com nome dado pela pessoa nunca é removida.
limpar();
juntarRegistoDaNuvem({ accounts: [{ id: "real", name: "Conta 1" }, { id: "c2", name: "Conta 2" }], activeId: "real" }, dados);
ok("'Conta 2' vazia fica", getRegistry().accounts.some((a) => a.id === "c2"));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
