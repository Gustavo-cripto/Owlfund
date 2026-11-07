// O 2FA no servidor: quem tem fator precisa de aal2, quem não tem nunca é travado.
import { aalDoToken, falta2fa, falta2faNaSessao, rotaAceitaSem2fa, temFatorVerificado } from "@/lib/auth/nivelSessao";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims: unknown) => `h.${b64url(claims)}.s`;
const aal1 = token({ aal: "aal1", user_metadata: { name: "João ÿ?>" } });
const aal2 = token({ aal: "aal2", user_metadata: { name: "João ÿ?>" } });
const comFator = { factors: [{ status: "verified" }] };
const porVerificar = { factors: [{ status: "unverified" }] };
const semFator = { factors: [] };

ok("lê aal1", aalDoToken(aal1) === "aal1");
ok("lê aal2 com acentos e base64url", aalDoToken(aal2) === "aal2");
ok("token ilegível dá null", aalDoToken("lixo") === null && aalDoToken(null) === null && aalDoToken("a.%%%.c") === null);
ok("fator por verificar não conta", !temFatorVerificado(porVerificar));
ok("com fator e aal1: falta", falta2fa(comFator, aal1));
ok("com fator e aal2: passa", !falta2fa(comFator, aal2));
ok("com fator e sem token: falta", falta2fa(comFator, null));
ok("sem fator e aal1: passa", !falta2fa(semFator, aal1));
ok("a meio de ativar o 2FA: passa", !falta2fa(porVerificar, aal1));
ok("utilizador sem lista de fatores: passa", !falta2fa({}, aal1) && !falta2fa(null, aal1));

for (const r of ["/api/auth/boas-vindas", "/api/auth/callback", "/api/auth/confirm", "/api/mfa/recover", "/api/mfa/recover/"]) ok(`${r} aceita sem 2FA`, rotaAceitaSem2fa(r));
for (const r of ["/api/wallet-sync", "/api/account/delete", "/api/mfa/recovery-codes", "/api/auth/outra", "/api/auth/../wallet-sync", "/api/mfa/recover/x", "/api/admin/contas"]) ok(`${r} exige 2FA`, !rotaAceitaSem2fa(r));

async function main() {
  let leuSessao = false;
  const sessao = (t: string | null) => ({ auth: { getSession: async () => { leuSessao = true; return { data: { session: t ? { access_token: t } : null } }; } } });
  ok("cookie aal1 com fator: falta", await falta2faNaSessao(sessao(aal1), comFator));
  ok("cookie aal2 com fator: passa", !(await falta2faNaSessao(sessao(aal2), comFator)));
  ok("cookie sem sessão legível com fator: falta", await falta2faNaSessao(sessao(null), comFator));
  const falha = { auth: { getSession: async () => { throw new Error("x"); } } };
  ok("falha a ler a sessão com fator: falta", await falta2faNaSessao(falha, comFator));
  leuSessao = false;
  ok("sem fator: passa", !(await falta2faNaSessao(sessao(aal1), semFator)));
  ok("sem fator: nem lê a sessão", !leuSessao);

  if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
  console.log("TODOS OK");
}

void main();
