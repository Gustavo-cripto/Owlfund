// Histórico de trades manuais — modelo e cálculo partilhados entre /historico
// e /fiscalidade (antes cada página tinha o seu FIFO e o seu formato).
//
// Persistência: localStorage por conta (accKey("trade-history-v1")), sincronizado
// com a nuvem pelo cloudSync. Cada registo tem `updatedAt` e, quando apagado,
// fica como "lápide" (`deleted: true`) para o merge entre dispositivos não
// ressuscitar trades apagados nem apagar trades feitos noutro aparelho.

import { ALL_ACCOUNTS_ID, accKey, allAccountIds, getActiveAccountId, readNamespaced } from "@/lib/portfolios/accounts";

export type TradeType = "compra" | "venda";

export type Trade = {
  id: string;
  type: TradeType;
  asset: string;          // símbolo, ex. "BTC"
  assetName: string;      // nome, ex. "Bitcoin"
  quantity: number;
  priceEur: number;       // preço unitário em EUR
  totalEur: number;       // quantity × priceEur (recalculado na leitura)
  date: string;           // "YYYY-MM-DD"
  exchange: string;
  notes: string;
  updatedAt?: number;     // ms epoch — usado no merge entre dispositivos
  deleted?: boolean;      // lápide: mantida ~90 dias para o merge, nunca mostrada
};

export const TRADE_HISTORY_KEY = "trade-history-v1";
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

const hasWindow = () => typeof window !== "undefined";

/** UUID com fallback para contextos sem crypto.randomUUID (http local, WebViews antigas). */
export function tradeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* fallback */ }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : NaN;
};

/** Valida/repara um registo vindo do storage; devolve null se irrecuperável. */
export function sanitizeTrade(raw: unknown): Trade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id ? r.id : tradeId();
  const type: TradeType = r.type === "venda" ? "venda" : "compra";
  const asset = String(r.asset ?? "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const quantity = num(r.quantity);
  const priceEur = num(r.priceEur);
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "";
  const deleted = r.deleted === true;
  const updatedAt = Number.isFinite(num(r.updatedAt)) ? num(r.updatedAt) : undefined;
  if (deleted) return { id, type, asset, assetName: "", quantity: 0, priceEur: 0, totalEur: 0, date, exchange: "", notes: "", updatedAt, deleted: true };
  if (!asset || !date || !(quantity > 0) || !(priceEur >= 0)) return null;
  return {
    id, type, asset,
    assetName: typeof r.assetName === "string" ? r.assetName : asset,
    quantity, priceEur,
    totalEur: quantity * priceEur,
    date,
    exchange: typeof r.exchange === "string" ? r.exchange : "",
    notes: typeof r.notes === "string" ? r.notes : "",
    updatedAt,
  };
}

export function parseTrades(raw: string | null): Trade[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(sanitizeTrade).filter((x): x is Trade => x !== null);
  } catch { return []; }
}

/** Ordem cronológica estável: data → compras antes de vendas no mesmo dia → updatedAt. */
export function chronoCompare(a: Trade, b: Trade): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.type !== b.type) return a.type === "compra" ? -1 : 1;
  return (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
}

/** Lê os trades (sem lápides) da conta ativa; na vista "Todas" agrega todas as contas. */
export function loadTrades(accountId?: string): Trade[] {
  if (!hasWindow()) return [];
  const id = accountId ?? getActiveAccountId();
  const ids = id === ALL_ACCOUNTS_ID ? allAccountIds() : [id];
  const out: Trade[] = [];
  for (const acc of ids) {
    let raw = readNamespaced(acc, TRADE_HISTORY_KEY);
    // Chave legada não-prefixada (quem tinha histórico antes das contas).
    if (raw == null && ids.length === 1) { try { raw = window.localStorage.getItem(TRADE_HISTORY_KEY); } catch { raw = null; } }
    out.push(...parseTrades(raw).filter(t => !t.deleted));
  }
  return out;
}

/** Escreve a lista completa (incluindo lápides) na conta ativa. Nunca na vista "Todas". */
export function writeTradesRaw(trades: Trade[], accountId?: string): boolean {
  if (!hasWindow()) return false;
  const id = accountId ?? getActiveAccountId();
  if (id === ALL_ACCOUNTS_ID) return false;
  const now = Date.now();
  const pruned = trades.filter(t => !t.deleted || (now - (t.updatedAt ?? 0)) < TOMBSTONE_TTL_MS);
  try {
    window.localStorage.setItem(accKey(TRADE_HISTORY_KEY, id), JSON.stringify(pruned));
    // Limpa a chave legada para não voltar a "aparecer" noutra conta nova.
    try { window.localStorage.removeItem(TRADE_HISTORY_KEY); } catch { /* ignore */ }
    return true;
  } catch { return false; }
}

/** Lista completa (com lápides) da conta — base para upsert/delete. */
function readAllWithTombstones(accountId: string): Trade[] {
  let raw = readNamespaced(accountId, TRADE_HISTORY_KEY);
  if (raw == null) { try { raw = window.localStorage.getItem(TRADE_HISTORY_KEY); } catch { raw = null; } }
  return parseTrades(raw);
}

export function upsertTrade(trade: Trade, accountId?: string): Trade[] {
  const id = accountId ?? getActiveAccountId();
  const all = readAllWithTombstones(id).filter(t => t.id !== trade.id);
  const next = [{ ...trade, totalEur: trade.quantity * trade.priceEur, updatedAt: Date.now(), deleted: undefined }, ...all];
  writeTradesRaw(next, id);
  return next.filter(t => !t.deleted);
}

export function deleteTrade(tradeId: string, accountId?: string): Trade[] {
  const id = accountId ?? getActiveAccountId();
  const all = readAllWithTombstones(id);
  const next = all.map(t => t.id === tradeId ? { ...t, deleted: true, updatedAt: Date.now() } : t);
  writeTradesRaw(next, id);
  return next.filter(t => !t.deleted);
}

export function restoreTrade(trade: Trade, accountId?: string): Trade[] {
  return upsertTrade({ ...trade, deleted: undefined }, accountId);
}

/** Merge entre duas listas (local × nuvem) por id: ganha o `updatedAt` maior; lápides contam. */
export function mergeTradeLists(a: Trade[], b: Trade[]): Trade[] {
  const byId = new Map<string, Trade>();
  for (const t of [...a, ...b]) {
    const prev = byId.get(t.id);
    if (!prev || (t.updatedAt ?? 0) > (prev.updatedAt ?? 0)) byId.set(t.id, t);
  }
  return Array.from(byId.values());
}

/** Merge de dois blobs JSON brutos (usado pelo cloudSync). */
export function mergeTradeRaw(localRaw: string | null, cloudRaw: string | null): string {
  return JSON.stringify(mergeTradeLists(parseTrades(localRaw), parseTrades(cloudRaw)));
}

// ── Cálculo ────────────────────────────────────────────────────────────────────

export type RealizedLot = { asset: string; buyDate: string; sellDate: string; buyPrice: number; sellPrice: number; amount: number; gain: number };

export type FifoResult = {
  realizedPnl: number;
  byAsset: Record<string, { realizedPnl: number; qtyNet: number; costOpen: number; buys: number; sells: number; name: string }>;
  unmatched: Record<string, number>;   // vendas sem compra registada (qty)
  lots: RealizedLot[];
  cumulative: Array<{ date: string; pnl: number }>; // PNL realizado acumulado por venda
};

export function computeFifo(trades: Trade[]): FifoResult {
  const pool: Record<string, Array<{ qty: number; price: number; date: string }>> = {};
  const byAsset: FifoResult["byAsset"] = {};
  const unmatched: Record<string, number> = {};
  const lots: RealizedLot[] = [];
  const cumulative: FifoResult["cumulative"] = [];
  let running = 0;
  const sorted = [...trades].filter(t => !t.deleted).sort(chronoCompare);
  for (const t of sorted) {
    if (!byAsset[t.asset]) byAsset[t.asset] = { realizedPnl: 0, qtyNet: 0, costOpen: 0, buys: 0, sells: 0, name: t.assetName || t.asset };
    const ba = byAsset[t.asset];
    if (t.type === "compra") {
      (pool[t.asset] ??= []).push({ qty: t.quantity, price: t.priceEur, date: t.date });
      ba.qtyNet += t.quantity; ba.buys += t.totalEur;
    } else {
      ba.qtyNet -= t.quantity; ba.sells += t.totalEur;
      let remaining = t.quantity;
      while (remaining > 1e-12 && pool[t.asset]?.length) {
        const lot = pool[t.asset][0];
        const used = Math.min(remaining, lot.qty);
        const gain = used * (t.priceEur - lot.price);
        ba.realizedPnl += gain; running += gain;
        lots.push({ asset: t.asset, buyDate: lot.date, sellDate: t.date, buyPrice: lot.price, sellPrice: t.priceEur, amount: used, gain });
        lot.qty -= used; remaining -= used;
        if (lot.qty <= 1e-12) pool[t.asset].shift();
      }
      if (remaining > 1e-9) unmatched[t.asset] = (unmatched[t.asset] ?? 0) + remaining;
      cumulative.push({ date: t.date, pnl: running });
    }
  }
  for (const [asset, lotsLeft] of Object.entries(pool)) {
    byAsset[asset].costOpen = lotsLeft.reduce((s, l) => s + l.qty * l.price, 0);
  }
  const realizedPnl = Object.values(byAsset).reduce((s, v) => s + v.realizedPnl, 0);
  return { realizedPnl, byAsset, unmatched, lots, cumulative };
}

// ── CSV ────────────────────────────────────────────────────────────────────────

export const CSV_HEADER = ["date", "type", "asset", "quantity", "price_eur", "total_eur", "exchange", "notes"] as const;

export function tradesToCsv(trades: Trade[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...trades].sort(chronoCompare).map(t =>
    [t.date, t.type === "compra" ? "buy" : "sell", t.asset, t.quantity, t.priceEur, t.quantity * t.priceEur, t.exchange, t.notes].map(esc).join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\n");
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const normDate = (s: string): string => {
  const v = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);            // dd/mm/yyyy (formato europeu)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const normNum = (s: string): number => {
  let v = s.replace(/[€$£\s]/g, "");
  // "1.234,56" → 1234.56 ; "1,234.56" → 1234.56 ; "0,5" → 0.5
  if (v.includes(",") && v.includes(".")) v = v.lastIndexOf(",") > v.lastIndexOf(".") ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  else if (v.includes(",")) v = v.replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

const BUY_WORDS = ["buy", "compra", "achat", "bid", "purchase"];
const SELL_WORDS = ["sell", "venda", "vente", "ask", "sale"];

/** Importa CSV genérico (cabeçalhos flexíveis: date/data, type/tipo, asset/ativo/symbol, quantity/qty/amount, price/preço, exchange, notes). */
export function parseTradesCsv(text: string): { trades: Trade[]; skipped: number; error?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { trades: [], skipped: 0, error: "empty" };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = splitCsvLine(lines[0], sep).map(h => h.toLowerCase().replace(/[^a-z]/g, ""));
  const col = (...names: string[]) => head.findIndex(h => names.some(n => h === n || h.startsWith(n)));
  const cDate = col("date", "data", "fecha", "time", "timestamp");
  const cType = col("type", "tipo", "side", "operation");
  const cAsset = col("asset", "ativo", "activo", "actif", "symbol", "coin", "pair", "market");
  const cQty = col("quantity", "qty", "quantidade", "cantidad", "amount", "volume", "size");
  const cPrice = col("priceeur", "price", "preco", "preo", "precio", "prix", "unit");
  const cEx = col("exchange", "origem", "source", "platform");
  const cNotes = col("notes", "notas", "note", "comment");
  if (cDate < 0 || cAsset < 0 || cQty < 0 || cPrice < 0) return { trades: [], skipped: 0, error: "columns" };
  const trades: Trade[] = []; let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    const date = normDate(cells[cDate] ?? "");
    const rawAsset = (cells[cAsset] ?? "").toUpperCase();
    const asset = rawAsset.split(/[\/\-_ ]/)[0].replace(/(EUR|USDT|USDC|USD)$/, (m) => rawAsset.length > m.length ? "" : m).replace(/[^A-Z0-9.]/g, "").slice(0, 12);
    const quantity = normNum(cells[cQty] ?? "");
    const priceEur = normNum(cells[cPrice] ?? "");
    const typeRaw = (cells[cType] ?? "buy").toLowerCase();
    const type: TradeType = SELL_WORDS.some(w => typeRaw.includes(w)) ? "venda" : BUY_WORDS.some(w => typeRaw.includes(w)) ? "compra" : quantity < 0 ? "venda" : "compra";
    const q = Math.abs(quantity);
    if (!date || !asset || !(q > 0) || !(priceEur >= 0)) { skipped++; continue; }
    trades.push({
      id: tradeId(), type, asset, assetName: asset, quantity: q, priceEur, totalEur: q * priceEur, date,
      exchange: cEx >= 0 ? (cells[cEx] ?? "") : "", notes: cNotes >= 0 ? (cells[cNotes] ?? "") : "", updatedAt: Date.now(),
    });
  }
  return { trades, skipped };
}
