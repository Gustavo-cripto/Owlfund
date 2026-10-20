// Cotação em euros de uma moeda, no momento do pagamento (contabilista, 20 out
// 2026: "ver a cotação na moeda de pagamento e passar fatura-recibo em euros").
import { precoOkx } from "@/lib/market/okxSpot";

const EUROS = new Set(["EUR", "EURC", "EUROC", "EURE"]);
const DOLARES = new Set(["USD", "USDC", "USDT", "PYUSD"]);

/** Quantos euros vale 1 unidade da moeda agora, e de onde veio o número. null se não houver cotação. */
export async function cotacaoEmEur(moeda: string): Promise<{ eur: number; fonte: string } | null> {
  const m = moeda.trim().toUpperCase();
  if (EUROS.has(m)) return { eur: 1, fonte: "paridade 1:1 com o euro" };
  const par = DOLARES.has(m) ? (m === "USD" ? "USDC" : m) : m;
  const okx = await precoOkx(`${par}-EUR`).catch(() => null);
  if (okx && okx > 0) return { eur: okx, fonte: `OKX ${par}-EUR` };
  if (DOLARES.has(m)) {
    try {
      const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", { signal: AbortSignal.timeout(8000) });
      const j = (await r.json()) as { rates?: { EUR?: number } };
      if (j.rates?.EUR && j.rates.EUR > 0) return { eur: j.rates.EUR, fonte: "BCE (Frankfurter) USD-EUR" };
    } catch { /* sem cotação */ }
  }
  return null;
}
