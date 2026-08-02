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
export type PortfolioCategory = { key: string; label: string; eur: number };
export type PortfolioSummary = {
  totalEur: number;
  categories: PortfolioCategory[];
  manualAssets: { sym: string; qty: number; invested: number }[];
  text: string | null;
};

const EMPTY_SUMMARY: PortfolioSummary = { totalEur: 0, categories: [], manualAssets: [], text: null };

/** Wrapper retrocompatível: só o texto para o prompt da IA. */
export async function buildPortfolioSummaryText(): Promise<string | null> {
  return (await buildPortfolioSummary()).text;
}

/**
 * Versão estruturada do resumo — devolve o total em EUR, categorias e ativos
 * manuais (para UI: mini-cards, boas-vindas) além do texto para a IA.
 */
export async function buildPortfolioSummary(): Promise<PortfolioSummary> {
  if (typeof window === "undefined") return EMPTY_SUMMARY;

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

  const manualAssets = manualSyms.slice(0, 30).map(([sym, h]) => ({
    sym,
    qty: Number(h.quantity) || 0,
    invested: Number(h.buyValue) || 0,
  }));

  const allCategories: PortfolioCategory[] = [
    { key: "onchain", label: "Carteiras on-chain (ETH/SOL/BTC/ADA)", eur: onChainEur },
    { key: "cex", label: "Exchanges centralizadas (CEX)", eur: cexEur },
    { key: "defi", label: "DeFi", eur: defiEur },
    { key: "manual", label: "Cripto adicionada manualmente", eur: manualCryptoEur },
    { key: "stable", label: "Stablecoins", eur: stableEur },
    { key: "traditional", label: "Mercado tradicional", eur: traditionalEur },
  ];
  const categories = allCategories.filter((c) => c.eur > 0);

  // Nada registado — não vale a pena enviar contexto à IA.
  if (total <= 0 && manualSyms.length === 0) {
    return { totalEur: 0, categories, manualAssets, text: null };
  }

  const fmt = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines: string[] = [];
  lines.push(`Valor total: € ${fmt(total)}`);

  for (const c of categories) lines.push(`  - ${c.label}: € ${fmt(c.eur)}`);

  if (manualAssets.length > 0) {
    lines.push("Ativos manuais registados:");
    for (const a of manualAssets) {
      const parts = [
        a.qty > 0 ? `${a.qty} moedas` : null,
        a.invested > 0 ? `investido € ${fmt(a.invested)}` : null,
      ].filter(Boolean);
      lines.push(`  - ${a.sym}${parts.length ? ` (${parts.join(", ")})` : ""}`);
    }
  }

  return { totalEur: total, categories, manualAssets, text: lines.join("\n") };
}
