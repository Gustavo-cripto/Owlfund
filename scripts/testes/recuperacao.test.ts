// Repor palavra-passe por token_hash (lote G): destino depois do verifyOtp e
// a regra "so abre o formulario com o cookie de recuperacao do mesmo utilizador".
import { COOKIE_RECUPERACAO, RECUPERACAO_MAX_AGE, destinoDaConfirmacao, destinoDaRecuperacao, lerCookie, sessaoDeRecuperacao } from "@/lib/auth/recuperacao";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${String(got)}${ok ? "" : ` (esperado ${String(want)})`}`); };

// ── destino da recuperacao ──
for (const l of ["pt", "en", "es", "fr"]) eq(`recuperacao ${l}`, destinoDaRecuperacao(l), `/reset-password?lang=${l}`);
eq("lang invalida cai em pt", destinoDaRecuperacao("de"), "/reset-password?lang=pt");
eq("sem lang cai em pt", destinoDaRecuperacao(null), "/reset-password?lang=pt");
eq("lang com lixo nao entra no URL", destinoDaRecuperacao("en&next=//evil.com"), "/reset-password?lang=pt");

// ── destino depois do verifyOtp ──
const base = { lang: "en", next: "/dashboard", contaNova: false, pediuDestino: false };
eq("recovery ignora o next", destinoDaConfirmacao({ ...base, type: "recovery", next: "/tax", pediuDestino: true }), "/reset-password?lang=en");
eq("recovery ignora conta nova", destinoDaConfirmacao({ ...base, type: "recovery", contaNova: true }), "/reset-password?lang=en");
eq("magiclink normal vai para o next", destinoDaConfirmacao({ ...base, type: "magiclink" }), "/dashboard");
eq("conta nova sem destino → /wallets", destinoDaConfirmacao({ ...base, type: "signup", contaNova: true }), "/wallets");
eq("conta nova com destino pedido fica no destino", destinoDaConfirmacao({ ...base, type: "signup", contaNova: true, pediuDestino: true, next: "/tax" }), "/tax");

// ── cookie ──
const UID = "2f1c4d8e-9a7b-4c3d-8e2f-1a2b3c4d5e6f";
eq("nome do cookie", COOKIE_RECUPERACAO, "cfa-recovery");
eq("dura 15 min", RECUPERACAO_MAX_AGE, 900);
eq("le o cookie entre outros", lerCookie(`cfa-lang=en; ${COOKIE_RECUPERACAO}=${UID}; x=1`, COOKIE_RECUPERACAO), UID);
eq("nao confunde prefixo", lerCookie(`x${COOKIE_RECUPERACAO}=abc`, COOKIE_RECUPERACAO), null);
eq("sem cookie → null", lerCookie("", COOKIE_RECUPERACAO), null);
eq("cookie + sessao do mesmo user abre", sessaoDeRecuperacao(`${COOKIE_RECUPERACAO}=${UID}`, UID), true);
eq("sessao normal sem cookie NAO abre", sessaoDeRecuperacao("cfa-lang=pt", UID), false);
eq("cookie de outro user NAO abre", sessaoDeRecuperacao(`${COOKIE_RECUPERACAO}=${UID}`, "3f1c4d8e-9a7b-4c3d-8e2f-1a2b3c4d5e6f"), false);
eq("cookie sem sessao NAO abre", sessaoDeRecuperacao(`${COOKIE_RECUPERACAO}=${UID}`, null), false);
eq("cookie vazio NAO abre", sessaoDeRecuperacao(`${COOKIE_RECUPERACAO}=`, ""), false);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
