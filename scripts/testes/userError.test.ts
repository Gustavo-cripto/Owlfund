import { userError } from "@/lib/ui/userError";
let fails = 0;
const eq = (name: string, got: string, want: string) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
const F = "Erro ao obter dados.";
eq("Failed to fetch → reserva", userError(new Error("Failed to fetch"), F), F);
eq("Load failed (Safari) → reserva", userError(new Error("Load failed"), F), F);
eq("JSON invalido → reserva", userError(new Error("Unexpected token < in JSON at position 0"), F), F);
eq("HTTP 503 → reserva", userError(new Error("HTTP 503"), F), F);
eq("AbortError → reserva", userError(new DOMException("The operation was aborted.", "AbortError"), F), F);
eq("vazio → reserva", userError(new Error(""), F), F);
eq("nao-Error → reserva", userError({ code: 1 }, F), F);
eq("HTML de erro → reserva", userError(new Error("<html><body>502 Bad Gateway</body></html>"), F), F);
eq("mensagem do /api passa", userError(new Error("Endereço BTC inválido."), F), "Endereço BTC inválido.");
eq("lib de carteira passa", userError(new Error("MetaMask não está disponível."), F), "MetaMask não está disponível.");
eq("string passa", userError("Limite do plano Free atingido.", F), "Limite do plano Free atingido.");
eq("rejeitado na carteira → texto proprio", userError(new Error("MetaMask Tx Signature: User denied transaction signature."), F, { rejected: "Cancelaste na carteira." }), "Cancelaste na carteira.");
eq("codigo 4001 → texto proprio", userError(new Error("Request rejected (4001)"), F, { rejected: "Cancelaste na carteira." }), "Cancelaste na carteira.");
const codes = { provider_missing: "{p} não está disponível.", no_account: "{p} não devolveu conta." };
eq("code mapeado + {p}", userError(Object.assign(new Error("Phantom não está disponível. Instala…"), { code: "provider_missing", provider: "Phantom" }), F, { codes }), "Phantom não está disponível.");
eq("code desconhecido → mensagem", userError(Object.assign(new Error("Carteira não encontrada."), { code: "not_found", provider: "" }), F, { codes }), "Carteira não encontrada.");
// Regressao, 21 set 2026: a pagina das carteiras rejeitava com new Error("timeout")
// e depois comparava o RESULTADO do userError com "timeout". Nunca batia, porque
// "timeout" cai na lista de ruido tecnico — e a mensagem com os passos para
// aprovar o pedido do Eternl nunca aparecia. Um erro com codigo nao se procura
// pelo texto: procura-se pelo codigo, antes de o humanizar.
eq("timeout e ruido tecnico (por isso o codigo e obrigatorio)", userError(new Error("timeout"), F), F);
eq("timed out tambem", userError(new Error("Request timed out"), F), F);

eq("sem mapa → mensagem", userError(Object.assign(new Error("MetaMask não está disponível."), { code: "provider_missing", provider: "MetaMask" }), F), "MetaMask não está disponível.");
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
