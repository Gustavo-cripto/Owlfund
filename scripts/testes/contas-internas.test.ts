import { eContaInterna } from "@/lib/analytics/internas";
let fails = 0;
const eq = (name: string, got: boolean, want: boolean) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
const lista = new Set(["teste@example.com", "056a9cc2-47cf-4a1c-b071-a3bbcb16a132"]);
eq("email interno", eContaInterna("teste@example.com", lista), true);
eq("email interno com maiúsculas e espaços", eContaInterna(" Teste@Example.com ", lista), true);
eq("email de cliente", eContaInterna("cliente@example.com", lista), false);
eq("conta sem email pelo id", eContaInterna(null, lista, "056a9cc2-47cf-4a1c-b071-a3bbcb16a132"), true);
eq("conta sem email e id desconhecido", eContaInterna(null, lista, "11111111-1111-1111-1111-111111111111"), false);
eq("sem nada", eContaInterna(undefined, lista), false);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
