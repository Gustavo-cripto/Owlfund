// Troca de pessoa no mesmo browser: o claimLocalData tem de apagar os dados
// PESSOAIS de quem estava antes (lista de baleias, alertas, favoritos, nome,
// plano FIRE) e deixar as preferências do browser (língua, tema) e o endereço
// da demonstração (é de quem está a criar conta agora). Set 2026.
import { claimLocalData, PERSONAL_KEYS } from "@/lib/portfolios/accounts";

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

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
