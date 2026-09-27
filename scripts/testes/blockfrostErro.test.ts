// /api/ada-balance: que frase e que estado para cada erro da Blockfrost (lote G).
import { respostaDoErroBlockfrost } from "@/lib/cardano/blockfrost";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const a = JSON.stringify(got), b = JSON.stringify(want); const ok = a === b; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${a}${ok ? "" : ` (esperado ${b})`}`); };

eq("400 (endereco mal formado) → endereco invalido", respostaDoErroBlockfrost(400), { key: "address_invalid_for_chain", status: 400 });
eq("422 → endereco invalido", respostaDoErroBlockfrost(422), { key: "address_invalid_for_chain", status: 400 });
eq("429 → demasiados pedidos", respostaDoErroBlockfrost(429), { key: "rate_limited", status: 429 });
// Problemas nossos (chave/quota): nunca "endereco invalido".
eq("402 (quota diaria) → indisponivel", respostaDoErroBlockfrost(402), { key: "balance_unavailable", status: 503 });
eq("403 (project_id) → indisponivel", respostaDoErroBlockfrost(403), { key: "balance_unavailable", status: 503 });
eq("418 (banido) → indisponivel", respostaDoErroBlockfrost(418), { key: "balance_unavailable", status: 503 });
eq("500 → indisponivel", respostaDoErroBlockfrost(500), { key: "balance_unavailable", status: 503 });
eq("sem estado (rede/timeout) → indisponivel", respostaDoErroBlockfrost(null), { key: "balance_unavailable", status: 503 });

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
