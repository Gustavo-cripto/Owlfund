// Assinatura do URL de cancelamento dos emails (/api/email/unsubscribe?u=…&t=…).
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "@/lib/emailOptout";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${String(got)}${ok ? "" : ` (esperado ${String(want)})`}`); };

const UID = "2f1c4d8e-9a7b-4c3d-8e2f-1a2b3c4d5e6f";
const SEG = "segredo-de-teste";
const tok = unsubscribeToken(UID, SEG);

eq("token e hex de 64", /^[0-9a-f]{64}$/.test(tok), true);
eq("determinista", unsubscribeToken(UID, SEG), tok);
eq("maiusculas no uuid dao o mesmo token", unsubscribeToken(UID.toUpperCase(), SEG), tok);
eq("verifica o certo", verifyUnsubscribeToken(UID, tok, SEG), true);
eq("recusa token trocado", verifyUnsubscribeToken(UID, tok.slice(0, 63) + (tok.endsWith("0") ? "1" : "0"), SEG), false);
eq("recusa token de outro user", verifyUnsubscribeToken("3f1c4d8e-9a7b-4c3d-8e2f-1a2b3c4d5e6f", tok, SEG), false);
eq("recusa token vazio", verifyUnsubscribeToken(UID, "", SEG), false);
eq("recusa tamanho errado", verifyUnsubscribeToken(UID, tok + "aa", SEG), false);
eq("outro segredo, outro token", unsubscribeToken(UID, "outro") === tok, false);
eq("sem segredo nao ha token", unsubscribeToken(UID, ""), "");
eq("sem segredo nunca verifica", verifyUnsubscribeToken(UID, "", ""), false);
eq("uuid invalido nao tem token", unsubscribeToken("nao-e-uuid", SEG), "");

process.env.EMAIL_UNSUBSCRIBE_SECRET = SEG;
delete process.env.CRON_SECRET;
const url = unsubscribeUrl(UID, "en", "https://chainfolioai.com/");
eq("url assinado", url, `https://chainfolioai.com/api/email/unsubscribe?u=${UID}&t=${tok}&lang=en`);
eq("lang invalida fica de fora", unsubscribeUrl(UID, "xx", "https://x.test")?.includes("lang="), false);
delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
process.env.CRON_SECRET = SEG;
eq("cai no CRON_SECRET", unsubscribeUrl(UID, undefined, "https://x.test"), `https://x.test/api/email/unsubscribe?u=${UID}&t=${tok}`);
delete process.env.CRON_SECRET;
eq("sem nenhum segredo: null", unsubscribeUrl(UID, "pt", "https://x.test"), null);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
