// Opções da estimativa na API/MCP: validação (antes de ler dados) e o que
// list_tax_countries anuncia por país.
import { COUNTRIES } from "@/lib/tax/countries";
import { opcoesDoPais, validarOpcoes, type OpcoesEstimativa } from "@/lib/api/opcoesImposto";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const P = (c: string) => COUNTRIES.find((x) => x.code === c)!;
const erro = (c: string, o: OpcoesEstimativa) => {
  const r = validarOpcoes(P(c), o);
  return "error" in r ? r.error : "sem erro";
};
  eq("ES não tem alternative", erro("ES", { alternative: true }), "option_not_available");
  eq("PT não tem taxa marginal", erro("PT", { marginalRate: 0.3 }), "option_not_available");
  eq("DE não tem taxa de longo própria", erro("DE", { marginalRateLong: 0.1 }), "option_not_available");
  eq("taxa acima de 60% recusada", erro("DE", { marginalRate: 42 }), "invalid_rate");
  eq("US com as duas taxas passa", JSON.stringify(validarOpcoes(P("US"), { marginalRate: 0.24, marginalRateLong: 0.15 })), JSON.stringify({ alternativa: false, taxaPessoal: { curto: 0.24, longo: 0.15 } }));
  const op = (c: string) => opcoesDoPais(P(c));
  eq("PT anuncia alternative", "alternative" in op("PT"), true);
  eq("US anuncia as duas taxas", /marginalRateLong/.test(String((op("US") as { marginalRate?: string }).marginalRate)), true);
  eq("ES: perdas 4 anos", (op("ES") as { lossCarryForward?: string }).lossCarryForward, "yes, 4 years");
  eq("FR sem opções", op("FR"), {});
  if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
