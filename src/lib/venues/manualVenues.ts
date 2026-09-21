// Saldos em corretoras registados à mão ou importados de um ficheiro.
//
// Serve as corretoras sem API (a app Crypto.com, a Revolut, a Trade Republic…)
// e quem, tendo API, prefere não criar chaves. Cada entrada é uma corretora
// com uma lista de moeda + quantidade. Fica por conta (namespace), sincroniza
// com a nuvem como os outros registos, e entra no total do portefólio pelo
// preço de mercado.
import { accKey, allAccountIds, isAllAccountsActive, marcarAlterado, readNamespaced } from "@/lib/portfolios/accounts";

export const VENUE_HOLDINGS_BASE = "owlfund.venue.holdings.v1";

export type VenueAsset = { asset: string; qty: number };
export type VenueHolding = {
  id: string;
  /** Identificador da corretora (ver VENUES). */
  venue: string;
  label?: string;
  assets: VenueAsset[];
  source: "manual" | "csv";
  updatedAt: number;
};

/** Corretoras oferecidas na grelha. `api` = também dá para ligar por chave. */
export const VENUES: ReadonlyArray<{ id: string; label: string; api: boolean; csv?: "cryptocom-app" }> = [
  { id: "cryptocom-app", label: "Crypto.com App", api: false, csv: "cryptocom-app" },
  // A app Revolut nao tem API; a Revolut X (a exchange deles) tem — sao produtos distintos.
  { id: "revolut", label: "Revolut (app)", api: false },
  { id: "trade-republic", label: "Trade Republic", api: false },
  { id: "bison", label: "BISON", api: false },
  // A API publica da eToro (2026) esta em acesso antecipado e nao da dados da conta.
  { id: "etoro", label: "eToro", api: false },
  // A app Nexo nao tem API; a Nexo Pro tem — como na Crypto.com, app e exchange sao carteiras separadas.
  { id: "nexo", label: "Nexo (app)", api: false },
  { id: "kraken", label: "Kraken", api: true },
  { id: "coinbase", label: "Coinbase", api: true },
  { id: "okx", label: "OKX", api: true },
  { id: "bybit", label: "Bybit", api: true },
  { id: "cryptocom", label: "Crypto.com Exchange", api: true },
  { id: "bitpanda", label: "Bitpanda", api: true },
  { id: "binance", label: "Binance", api: true },
  { id: "coinex", label: "CoinEx", api: true },
  { id: "outra", label: "Outra", api: false },
];

const limpar = (raw: unknown): VenueHolding[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Partial<VenueHolding>;
    if (typeof o.id !== "string" || typeof o.venue !== "string" || !Array.isArray(o.assets)) return [];
    const assets = o.assets
      .filter((a): a is VenueAsset => !!a && typeof a === "object" && typeof (a as VenueAsset).asset === "string" && Number.isFinite((a as VenueAsset).qty))
      .map((a) => ({ asset: a.asset.toUpperCase().slice(0, 12), qty: a.qty }))
      .filter((a) => a.asset && a.qty > 0);
    return [{ id: o.id, venue: o.venue, label: typeof o.label === "string" ? o.label : undefined, assets, source: o.source === "csv" ? "csv" : "manual", updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0 }];
  });
};

export function loadVenueHoldings(): VenueHolding[] {
  try {
    if (isAllAccountsActive()) {
      return allAccountIds().flatMap((id) => {
        const raw = readNamespaced(id, VENUE_HOLDINGS_BASE);
        try { return raw ? limpar(JSON.parse(raw)) : []; } catch { return []; }
      });
    }
    const raw = localStorage.getItem(accKey(VENUE_HOLDINGS_BASE));
    return raw ? limpar(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function saveVenueHoldings(list: VenueHolding[]): void {
  if (isAllAccountsActive()) return;                        // vista combinada é só leitura
  try { localStorage.setItem(accKey(VENUE_HOLDINGS_BASE), JSON.stringify(list)); marcarAlterado(VENUE_HOLDINGS_BASE); } catch { /* ignore */ }
}

export const venueId = () => `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
