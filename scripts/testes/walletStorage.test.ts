// O snapshot das carteiras tem de guardar e reler traditionalEur (valor de
// mercado dos tradicionais) — antes a chave era descartada duas vezes e o
// Painel/Portefolio/IA caiam sempre no valor investido. Testa tambem a soma na
// vista "Todas" (auditoria set 2026, lote A).
import { loadWalletSnapshot, updateWalletSnapshot } from "@/lib/wallets/storage";
import { createAccount, setActiveAccountId, ALL_ACCOUNTS_ID, getActiveAccountId } from "@/lib/portfolios/accounts";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

// localStorage a fingir (so o que o codigo usa).
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

// Conta 1: gravar + reler.
updateWalletSnapshot({ eth: [{ address: "0xabc", balance: "1.5" }], cexUsd: 100, traditionalEur: 2500.5 });
const lido = loadWalletSnapshot();
ok("traditionalEur sobrevive a gravar + reler", lido.traditionalEur === 2500.5, String(lido.traditionalEur));
ok("os outros campos continuam la", lido.cexUsd === 100 && lido.eth?.length === 1);

// Um patch so com outro campo nao apaga o traditionalEur.
updateWalletSnapshot({ manualEur: 40 });
ok("patch parcial mantem traditionalEur", loadWalletSnapshot().traditionalEur === 2500.5);
ok("…e aplica o novo campo", loadWalletSnapshot().manualEur === 40);

// Valor nao numerico e ignorado (nunca grava lixo).
updateWalletSnapshot({ traditionalEur: "abc" as unknown as number });
ok("valor nao numerico e ignorado", loadWalletSnapshot().traditionalEur === 2500.5);

// Conta 2 vazia: nao herda nada da conta 1.
const conta1 = getActiveAccountId();
const conta2 = createAccount("Conta 2");
setActiveAccountId(conta2.id);
ok("conta nova nasce vazia", Object.values(loadWalletSnapshot()).every((v) => v === undefined));
updateWalletSnapshot({ traditionalEur: 1000, btc: [{ address: "bc1q", balance: "0.1" }] });

// Vista "Todas": soma os tradicionais das duas contas e junta as carteiras.
setActiveAccountId(ALL_ACCOUNTS_ID);
const todas = loadWalletSnapshot();
ok("Todas soma traditionalEur (2500.5 + 1000)", todas.traditionalEur === 3500.5, String(todas.traditionalEur));
ok("Todas junta as carteiras", (todas.eth?.length ?? 0) === 1 && (todas.btc?.length ?? 0) === 1);
ok("Todas soma cexUsd so de quem tem", todas.cexUsd === 100);

// A vista "Todas" e so leitura: gravar nela nao muda nenhuma conta.
updateWalletSnapshot({ traditionalEur: 1 });
setActiveAccountId(conta1);
ok("gravar na vista Todas nao toca na conta 1", loadWalletSnapshot().traditionalEur === 2500.5);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("\nTODOS OK");
