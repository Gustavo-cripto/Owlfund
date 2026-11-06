// Troca de pessoa no mesmo browser: o claimLocalData tem de apagar os dados
// PESSOAIS de quem estava antes (lista de baleias, alertas, favoritos, nome,
// plano FIRE) e deixar as preferências do browser (língua, tema) e o endereço
// da demonstração (é de quem está a criar conta agora). Set 2026.
import { claimLocalData, esquecerChavesExchangeLocais, limparDadosLocais, PERSONAL_KEYS, temChavesExchangeLocais } from "@/lib/portfolios/accounts";

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

// 1.º login no browser: reclama, não apaga nada.
localStorage.setItem("smart-money-watchlist", "[1]");
ok("1.º login não limpa", claimLocalData("user-A") === false && localStorage.getItem("smart-money-watchlist") === "[1]");

// A usa o site.
for (const k of PERSONAL_KEYS) localStorage.setItem(k, "de-A");
localStorage.setItem("fire-plan-v1:user-A", "{}");
localStorage.setItem("owlfund-lang", "en");
localStorage.setItem("owlfund-settings", "{}");
localStorage.setItem("cfa-demo-address", "0xdemo");

// Mesmo utilizador: nada muda.
ok("mesmo utilizador não limpa", claimLocalData("user-A") === false && localStorage.getItem("owlfund.nickname") === "de-A");

// Entra B no mesmo browser.
ok("outro utilizador limpa", claimLocalData("user-B") === true);
for (const k of PERSONAL_KEYS) ok(`sai ${k}`, localStorage.getItem(k) === null);
ok("sai o plano FIRE de A", localStorage.getItem("fire-plan-v1:user-A") === null);
ok("fica a língua do browser", localStorage.getItem("owlfund-lang") === "en");
ok("ficam as definições do browser", localStorage.getItem("owlfund-settings") === "{}");
ok("fica o endereço da demonstração", localStorage.getItem("cfa-demo-address") === "0xdemo");

// As chaves de exchange de A não podem passar para B (auditoria 6 nov 2026).
for (const k of ["cex-accounts-v1", "hl-accounts-v1", "owlfund.chat.messages.v3", "portfolio-note"]) {
  ok(`${k} é chave pessoal`, (PERSONAL_KEYS as readonly string[]).includes(k));
}
localStorage.setItem("cex-accounts-v1", "[]");
ok("lista vazia não conta como chaves", temChavesExchangeLocais() === false);
localStorage.setItem("cex-accounts-v1", "nao-e-json");
ok("lixo não conta como chaves", temChavesExchangeLocais() === false);
localStorage.setItem("cex-accounts-v1", '[{"id":"1"}]');
ok("deteta chaves locais", temChavesExchangeLocais() === true);
esquecerChavesExchangeLocais();
ok("esquecer tira as chaves", temChavesExchangeLocais() === false);

// Apagar a conta: Object.keys(localStorage) tem de ver as chaves guardadas.
const apagaveis = new Proxy(localStorage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (_, k) => (typeof k === "string" && store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined),
});
g.window = { localStorage: apagaveis, dispatchEvent: () => true };
for (const k of PERSONAL_KEYS) localStorage.setItem(k, "de-B");
localStorage.setItem("fire-plan-v1:user-B", "{}");
localStorage.setItem("cf.owner.v1", "user-B");
localStorage.setItem("cf.acct.a_1.trade-history-v1", "[]");
localStorage.setItem("cfa-demo-address", "0xdemo");
limparDadosLocais();
for (const k of PERSONAL_KEYS) ok(`apagar a conta tira ${k}`, localStorage.getItem(k) === null);
ok("apagar a conta tira o plano FIRE", localStorage.getItem("fire-plan-v1:user-B") === null);
ok("apagar a conta tira os portefólios", localStorage.getItem("cf.acct.a_1.trade-history-v1") === null);
ok("apagar a conta tira o dono do browser", localStorage.getItem("cf.owner.v1") === null);
ok("fica o endereço da demonstração", localStorage.getItem("cfa-demo-address") === "0xdemo");

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
