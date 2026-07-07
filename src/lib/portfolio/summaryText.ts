import { loadWalletSnapshot, type StoredWalletEntry } from "@/lib/wallets/storage";
import { loadCryptoHoldings, loadStablecoinEntries } from "@/lib/crypto/storage";
import { loadTraditionalHoldings } from "@/lib/traditional/storage";

const sumBalances = (entries?: StoredWalletEntry[]) =>
  (entries ?? []).reduce((sum, e) => {
    const v = Number(e.balance ?? 0);
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);

/**
 * Monta um resumo textual do portfolio COMPLETO do utilizador a partir do
 * localStorage — carteiras on-chain, CEX, DeFi, cripto manual (valor de mercado),
 * stablecoins e mercado tradicional. Devolve null se não houver nada a reportar.
 *
 * Corre no cliente (lê localStorage e faz fetch a /api/prices). O texto é enviado
 * para /api/chat e injetado no prompt de sistema, para o assistente conhecer os
 * ativos reais (incluindo os adicionados manualmente).
 */
export async function buildPortfolioSummaryText(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const snap = loadWalletSnapshot();
  const holdings = loadCryptoHoldings();
  const stables = loadStablecoinEntries();
  const traditional = loadTraditionalHoldings();

  // Preços em EUR (ETH/SOL/BTC/ADA) + câmbio USD→EUR
  let prices: Record<string, number> = {};
  let usdToEur = 0.92;
  try {
    const r = await fetch("/api/prices", { cache: "no-store" });
    if (r.ok) {
      const d = (await r.json()) as { prices?: Record<string, number> };
      prices = d.prices ?? {};
      const rate = Number(prices.usdToEur);
      if (Number.isFinite(rate) && rate > 0) usdToEur = rate;
    }
  } catch {
    // segue com fallback
  }

  const onChainEur =
    sumBalances(snap.eth) * (prices.ETH ?? 0) +
    sumBalances(snap.sol) * (prices.SOL ?? 0) +
    sumBalances(snap.btc) * (prices.BTC ?? 0) +
    sumBalances(snap.ada) * (prices.ADA ?? 0);
  const cexEur = (snap.cexUsd ?? 0) * usdToEur;
  const defiEur = (snap.defiUsd ?? 0) * usdToEur;

  // Cripto manual: preferir o valor de mercado guardado no snapshot (quantidade ×
  // preço, calculado na página de Carteiras); senão o valor investido.
  const manualFromHoldings = Object.values(holdings).reduce((s, h) => {
    const v = Number(h.buyValue ?? 0);
    return Number.isFinite(v) ? s + v : s;
  }, 0);
  const manualCryptoEur =
    typeof snap.manualEur === "number" && snap.manualEur > 0 ? snap.manualEur : manualFromHoldings;

  const stableEur = stables.reduce((s, e) => s + (parseFloat(e.balance ?? "0") || 0), 0);
  const traditionalEur = Object.values(traditional).reduce((s, h) => {
    const v = Number(h.buyValue ?? 0);
    return Number.isFinite(v) ? s + v : s;
  }, 0);

  const total = onChainEur + cexEur + defiEur + manualCryptoEur + stableEur + traditionalEur;

  const manualSyms = Object.entries(holdings).filter(
    ([, h]) => (Number(h.quantity) || 0) > 0 || (Number(h.buyValue) || 0) > 0,
  );

  // Nada registado — não vale a pena enviar contexto.
  if (total <= 0 && manualSyms.length === 0) return null;

  const fmt = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines: string[] = [];
  lines.push(`Valor total: € ${fmt(total)}`);

  const cat = (label: string, v: number) => {
    if (v > 0) lines.push(`  - ${label}: € ${fmt(v)}`);
  };
  cat("Carteiras on-chain (ETH/SOL/BTC/ADA)", onChainEur);
  cat("Exchanges centralizadas (CEX)", cexEur);
  cat("DeFi", defiEur);
  cat("Cripto adicionada manualmente", manualCryptoEur);
  cat("Stablecoins", stableEur);
  cat("Mercado tradicional", traditionalEur);

  if (manualSyms.length > 0) {
    lines.push("Ativos manuais registados:");
    for (const [sym, h] of manualSyms.slice(0, 30)) {
      const qty = Number(h.quantity) || 0;
      const inv = Number(h.buyValue) || 0;
      const parts = [
        qty > 0 ? `${qty} moedas` : null,
        inv > 0 ? `investido € ${fmt(inv)}` : null,
      ].filter(Boolean);
      lines.push(`  - ${sym}${parts.length ? ` (${parts.join(", ")})` : ""}`);
    }
  }

  return lines.join("\n");
}
