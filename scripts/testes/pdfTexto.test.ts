import { paraPdf } from "@/lib/export/pdfTexto";
let fails = 0;
const eq = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
eq("milhares em francês (espaço fino)", paraPdf((12345).toLocaleString("fr-FR")), "12 345");
eq("≥ e ≈", paraPdf("Exonéré (≥ 365 jours) ≈ 5"), "Exonéré (>= 365 jours) ~ 5");
eq("mantém €, –, acentos e aspas curvas", paraPdf("15–30% · 5 € ‘ok’ çãé"), "15–30% · 5 € ‘ok’ çãé");
eq("tira emojis", paraPdf("⇄ Troca 🧾"), "<-> Troca ");
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
