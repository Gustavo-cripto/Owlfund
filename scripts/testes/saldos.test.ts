// Uma leitura falhada nunca pode pôr o total a 0 (auditoria 28 set 2026).
import { aposFalha, leituraRecente, primeiroSaldo, temSaldo, valorDoSaldo } from "@/lib/wallets/saldos";

let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

ok("'—' não é saldo", !temSaldo("—"));
ok("undefined não é saldo", !temSaldo(undefined));
ok("vazio não é saldo", !temSaldo(""));
ok("lixo não é saldo", !temSaldo("abc"));
ok("'0.0000' é saldo (carteira vazia é real)", temSaldo("0.0000"));
ok("número é saldo", temSaldo(1.5));
ok("NaN não é saldo", !temSaldo(Number.NaN));

ok("falha ('—') cai no guardado", valorDoSaldo("—", "1.2500") === 1.25);
ok("sem leitura cai no guardado", valorDoSaldo(undefined, "2") === 2);
ok("leitura boa ganha ao guardado", valorDoSaldo("3.5", "2") === 3.5);
ok("leitura 0 é respeitada (não cai no guardado)", valorDoSaldo("0", "2") === 0);
ok("nada utilizável → 0", valorDoSaldo("—", undefined, null) === 0);
ok("terceiro candidato", valorDoSaldo("—", undefined, "7") === 7);
ok("primeiroSaldo devolve o texto", primeiroSaldo("—", "1.2500") === "1.2500");
ok("primeiroSaldo sem nada → null", primeiroSaldo("—", undefined) === null);

const bom = { a: "1.0" };
ok("falha mantém o saldo bom (mesmo objeto)", aposFalha(bom, "a") === bom);
ok("falha sem saldo anterior marca '—'", aposFalha({}, "a").a === "—");
ok("falha sobre '—' continua '—'", aposFalha({ a: "—" }, "a").a === "—");

const m = new Map<string, number>([["k", 1000]]);
ok("leitura há 5 s é recente", leituraRecente(m, "k", 6000));
ok("leitura há 25 s já não é", !leituraRecente(m, "k", 26000));
ok("chave nova nunca é recente", !leituraRecente(m, "x", 6000));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
