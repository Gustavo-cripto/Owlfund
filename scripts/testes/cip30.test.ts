import { cip30ParaErro } from "@/lib/wallets/cardano";
import { userError } from "@/lib/ui/userError";
let fails = 0;
const eq = (name: string, got: string, want: string) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
const F = "Erro ao ligar.";
// As carteiras Cardano recusam com um objeto { code, info }, nao com um Error.
eq("recusa (-3) → cancelamento", userError(cip30ParaErro({ code: -3, info: "user declined" }, "Eternl"), F, { rejected: "Cancelaste na carteira." }), "Cancelaste na carteira.");
eq("sem conta dApp → info passa", userError(cip30ParaErro({ code: -2, info: "no account set" }, "Eternl"), F), "no account set");
eq("objeto sem info → razao com o nome", userError(cip30ParaErro({ code: -1 }, "Lace"), F), "Lace: a extensão recusou o pedido.");
eq("Error normal passa intacto", userError(cip30ParaErro(new Error("Eternl não está disponível."), "Eternl"), F), "Eternl não está disponível.");
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
