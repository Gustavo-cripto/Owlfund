import { construirFaturaRecibo } from "@/lib/faturacao/invoicexpress";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const base = { idUnico: "stripe-in_123", codigoCliente: "cus_1", nome: "Ana", email: "ana@x.pt", descricao: "Premium mensal", data: new Date("2026-11-05T10:00:00Z") };
const f = construirFaturaRecibo({ ...base, totalEur: 14.99 }, { taxa: 23, nomeImposto: "IVA23", serie: "" });
eq("preço sem IVA de 14,99", f.invoice.items[0].unit_price, 12.187);
eq("com IVA volta a 14,99", Math.round(f.invoice.items[0].unit_price * 1.23 * 100) / 100, 14.99);
const g = construirFaturaRecibo({ ...base, totalEur: 39 }, { taxa: 23, nomeImposto: "IVA23", serie: "" });
eq("com IVA volta a 39,00", Math.round(g.invoice.items[0].unit_price * 1.23 * 100) / 100, 39);
eq("data dd/mm/aaaa", f.invoice.date, "05/11/2026");
eq("sem NIF: consumidor final (sem fiscal_id)", "fiscal_id" in f.invoice.client, false);
const h = construirFaturaRecibo({ ...base, totalEur: 14.99, nif: " 123 456 789 " }, { taxa: 23, nomeImposto: "IVA23", serie: "77" });
eq("NIF limpo", (h.invoice.client as { fiscal_id?: string }).fiscal_id, "123456789");
eq("série", (h.invoice as { sequence_id?: string }).sequence_id, "77");
eq("id único contra duplicados", h.proprietary_uid, "stripe-in_123");
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
