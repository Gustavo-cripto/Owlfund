import { capEstaveis, epocaAltcoins, resumoFng } from "@/lib/market/indicadoresGerais";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const rows = [
  { symbol: "BTC", marketCapUsd: 1000, change30d: 5 },
  { symbol: "USDT", marketCapUsd: 150, change30d: 0 },
  { symbol: "USDC", marketCapUsd: 50, change30d: 0 },
  { symbol: "WBTC", marketCapUsd: 10, change30d: 5.5 },
  ...Array.from({ length: 12 }, (_, i) => ({ symbol: `A${i}`, marketCapUsd: 100 - i, change30d: i < 4 ? 10 : 1 })),
];
eq("estáveis: 200 de 2.000", capEstaveis(rows, 2000), { usd: 200, parte: 10 });
eq("altcoins acima do BTC: 4 de 12 (sem estáveis nem WBTC)", epocaAltcoins(rows), { acima: 4, total: 12 });
eq("sem BTC → null", epocaAltcoins(rows.slice(1)), null);
const dia = 86_400;
eq("medo e ganância: último e variação a 7 dias", resumoFng([
  { value: 30, classification: "Fear", timestampSec: 10 * dia },
  { value: 62, classification: "Greed", timestampSec: 17 * dia },
  { value: 55, classification: "Neutral", timestampSec: 16 * dia },
]), { valor: 62, classe: "ganancia", var7: 32 });
eq("classificação desconhecida usa o valor", resumoFng([{ value: 10, classification: "?", timestampSec: 1 }])?.classe, "medo_extremo");
if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
