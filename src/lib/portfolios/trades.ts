// Histórico de trades manuais — modelo e cálculo partilhados entre /historico
// e /fiscalidade (antes cada página tinha o seu FIFO e o seu formato).
//
// Persistência: localStorage por conta (accKey("trade-history-v1")), sincronizado
// com a nuvem pelo cloudSync. Cada registo tem `updatedAt` e, quando apagado,
// fica como "lápide" (`deleted: true`) para o merge entre dispositivos não
// ressuscitar trades apagados nem apagar trades feitos noutro aparelho.

import { ALL_ACCOUNTS_ID, accKey, allAccountIds, getActiveAccountId, readNamespaced } from "@/lib/portfolios/accounts";

// "taxa": registo so de taxa, sem compra nem venda — swap falhado, aprovacao,
// gas pago de outra carteira. Tira a quantidade do ativo (e o seu custo) do
// FIFO, mas NAO gera mais/menos-valia nem e deduzida automaticamente: o
// tratamento fiscal destas despesas varia por pais, e fica visivel a parte
// para a pessoa (ou o contabilista) decidir.
export type TradeType = "compra" | "venda" | "taxa";

export type Trade = {
  id: string;
  type: TradeType;
  asset: string;          // símbolo, ex. "BTC"
  assetName: string;      // nome, ex. "Bitcoin"
  quantity: number;
  /**
   * Preço unitário em EUR — a unidade interna de toda a app.
   *
   * Quem regista em dolares fica com o valor convertido a taxa DA DATA da
   * transacao (nao a de hoje), e o que escreveu guarda-se em `priceInput` +
   * `currency`. Assim o portefolio, o PNL e os graficos continuam a somar numa
   * so moeda, e o relatorio fiscal reconverte para a moeda do pais onde se
   * declara — tambem a taxa de cada data.
   */
  priceEur: number;
  totalEur: number;       // quantity × priceEur (recalculado na leitura)
  /** Moeda em que a pessoa registou o preço. Ausente = EUR (registos antigos). */
  currency?: string;
  /** Preço unitário tal como foi escrito, na moeda acima. */
  priceInput?: number;
  /**
   * Taxa/comissão/gás da operação, em EUR (convertida a taxa da data, como o
   * preço). Ausente = 0 (registos antigos). Na COMPRA soma ao custo do lote;
   * na VENDA desce ao produto — e assim que as autoridades fiscais tratam as
   * despesas de transação na generalidade dos países cobertos.
   */
  feeEur?: number;
  /** Taxa tal como foi escrita: na moeda do preço (`currency`) ou, com `feeAsset`, em unidades desse token. */
  feeInput?: number;
  /**
   * Taxa paga em token (ex.: "ETH" para gas). `feeInput` = quantidade do token;
   * `feeEur` = o seu valor na data. O FIFO tira essa quantidade ao token.
   */
  feeAsset?: string;
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
  const type: TradeType = r.type === "venda" ? "venda" : r.type === "taxa" ? "taxa" : "compra";
  const asset = String(r.asset ?? "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const quantity = num(r.quantity);
  const priceEur = num(r.priceEur);
  const currency = typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : undefined;
  const priceInput = Number.isFinite(num(r.priceInput)) ? num(r.priceInput) : undefined;
  // Taxa: so valores >= 0; ausente ou invalida = sem taxa (nunca parte o registo).
  const feeEur = num(r.feeEur) > 0 ? num(r.feeEur) : undefined;
  const feeInput = feeEur !== undefined && num(r.feeInput) >= 0 ? num(r.feeInput) : undefined;
  const feeAsset = feeEur !== undefined && feeInput !== undefined && typeof r.feeAsset === "string" && /^[A-Z0-9.]{2,12}$/.test(r.feeAsset) ? r.feeAsset : undefined;
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
    currency, priceInput,
    ...(feeEur !== undefined ? { feeEur, ...(feeInput !== undefined ? { feeInput } : {}), ...(feeAsset ? { feeAsset } : {}) } : {}),
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

/** `gain` ja e liquido de taxas; `fees` e a parte das taxas (compra + venda) que cabe a este lote. */
export type RealizedLot = { asset: string; buyDate: string; sellDate: string; buyPrice: number; sellPrice: number; amount: number; fees: number; gain: number };

export type FifoResult = {
  realizedPnl: number;
  // buys = custo total das compras (inclui taxas); sells = produto liquido das vendas (ja sem taxas).
  byAsset: Record<string, { realizedPnl: number; qtyNet: number; costOpen: number; buys: number; sells: number; fees: number; name: string }>;
  /** Total de taxas registadas nas compras e vendas (deduzidas no ganho). */
  fees: number;
  /** Valor dos registos "so taxa" (nao deduzidos automaticamente). */
  standaloneFees: number;
  unmatched: Record<string, number>;   // vendas sem compra registada (qty)
  lots: RealizedLot[];
  cumulative: Array<{ date: string; pnl: number }>; // PNL realizado acumulado por venda
};

export function computeFifo(trades: Trade[]): FifoResult {
  // feePerUnit: a taxa da compra repartida pelas unidades do lote, para que uma
  // venda parcial leve so a parte que lhe cabe.
  const pool: Record<string, Array<{ qty: number; price: number; feePerUnit: number; date: string }>> = {};
  const byAsset: FifoResult["byAsset"] = {};
  const unmatched: Record<string, number> = {};
  const lots: RealizedLot[] = [];
  const cumulative: FifoResult["cumulative"] = [];
  let running = 0;
  let standaloneFees = 0;
  const entry = (asset: string, name?: string) =>
    (byAsset[asset] ??= { realizedPnl: 0, qtyNet: 0, costOpen: 0, buys: 0, sells: 0, fees: 0, name: name || asset });
  // Tira `qty` do ativo pelos lotes mais antigos, sem ganho (a taxa paga em
  // token sai do saldo; o seu valor ja conta como taxa onde deve).
  const consume = (asset: string, qty: number) => {
    entry(asset).qtyNet -= qty;
    let remaining = qty;
    while (remaining > 1e-12 && pool[asset]?.length) {
      const lot = pool[asset][0];
      const used = Math.min(remaining, lot.qty);
      lot.qty -= used; remaining -= used;
      if (lot.qty <= 1e-12) pool[asset].shift();
    }
  };
  const sorted = [...trades].filter(t => !t.deleted).sort(chronoCompare);
  for (const t of sorted) {
    const ba = entry(t.asset, t.assetName);
    if (t.type === "taxa") {
      consume(t.asset, t.quantity);
      ba.fees += t.totalEur;
      standaloneFees += t.totalEur;
      continue;
    }
    const fee = t.feeEur ?? 0;
    ba.fees += fee;
    if (t.feeAsset && (t.feeInput ?? 0) > 0) consume(t.feeAsset, t.feeInput ?? 0);
    if (t.type === "compra") {
      (pool[t.asset] ??= []).push({ qty: t.quantity, price: t.priceEur, feePerUnit: t.quantity > 0 ? fee / t.quantity : 0, date: t.date });
      ba.qtyNet += t.quantity; ba.buys += t.totalEur + fee;
    } else {
      ba.qtyNet -= t.quantity; ba.sells += t.totalEur - fee;
      const sellFeePerUnit = t.quantity > 0 ? fee / t.quantity : 0;
      let remaining = t.quantity;
      while (remaining > 1e-12 && pool[t.asset]?.length) {
        const lot = pool[t.asset][0];
        const used = Math.min(remaining, lot.qty);
        const lotFees = used * (lot.feePerUnit + sellFeePerUnit);
        const gain = used * (t.priceEur - lot.price) - lotFees;
        ba.realizedPnl += gain; running += gain;
        lots.push({ asset: t.asset, buyDate: lot.date, sellDate: t.date, buyPrice: lot.price, sellPrice: t.priceEur, amount: used, fees: lotFees, gain });
        lot.qty -= used; remaining -= used;
        if (lot.qty <= 1e-12) pool[t.asset].shift();
      }
      if (remaining > 1e-9) unmatched[t.asset] = (unmatched[t.asset] ?? 0) + remaining;
      cumulative.push({ date: t.date, pnl: running });
    }
  }
  for (const [asset, lotsLeft] of Object.entries(pool)) {
    byAsset[asset].costOpen = lotsLeft.reduce((s, l) => s + l.qty * (l.price + l.feePerUnit), 0);
  }
  const realizedPnl = Object.values(byAsset).reduce((s, v) => s + v.realizedPnl, 0);
  const fees = Object.values(byAsset).reduce((s, v) => s + v.fees, 0) - standaloneFees;
  return { realizedPnl, byAsset, unmatched, lots, cumulative, fees, standaloneFees };
}

// ── CSV ────────────────────────────────────────────────────────────────────────

// `price_eur` e a unidade interna e continua a ser a coluna que o importador
// le. As duas ultimas dizem o que a pessoa escreveu de facto — acrescentadas no
// fim para nao partir ficheiros ja exportados nem importadores de terceiros.
// fee_eur / fee_original (taxa em EUR e tal como foi escrita) vieram depois, e
// tambem no fim, pela mesma razao: ficheiros antigos continuam a importar.
// fee_asset: token em que a taxa foi paga (vazio = na moeda do preco).
export const CSV_HEADER = ["date", "type", "asset", "quantity", "price_eur", "total_eur", "exchange", "notes", "currency", "price_original", "fee_eur", "fee_original", "fee_asset"] as const;

export function tradesToCsv(trades: Trade[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...trades].sort(chronoCompare).map(t =>
    [t.date, t.type === "compra" ? "buy" : t.type === "venda" ? "sell" : "fee", t.asset, t.quantity, t.priceEur, t.quantity * t.priceEur, t.exchange, t.notes, t.currency ?? "EUR", t.priceInput ?? t.priceEur, t.feeEur ?? 0, t.feeInput ?? t.feeEur ?? 0, t.feeAsset ?? ""].map(esc).join(","),
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
const FEE_WORDS = ["fee", "gas", "taxa", "frais", "comis"];

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
  // So se aceita "currency" quando vem com o preco original ao lado: sem ele
  // nao ha como saber se a coluna do preco esta nessa moeda ou ja em euros.
  const cCur = col("currency", "moeda", "divisa", "devise");
  const cOrig = col("priceoriginal", "precooriginal");
  // Taxa: coluna generica (fee, commission, gas…) lida na mesma unidade da
  // coluna do preco — como o preco. fee_original so vale com a moeda ao lado.
  // "gas" so por igual: "gasprice"/"gaslimit" nao sao a taxa paga.
  const cFee = head.findIndex(h => h !== "feeoriginal" && (["gas", "gasfee", "gasusd", "gaseur"].includes(h) || ["feeeur", "fee", "commission", "comissao", "comisso", "comision", "taxa", "frais"].some(n => h === n || h.startsWith(n))));
  const cFeeOrig = col("feeoriginal");
  const cFeeAsset = col("feeasset", "feecoin", "feetoken", "feecurrency");
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
    const type: TradeType = SELL_WORDS.some(w => typeRaw.includes(w)) ? "venda" : BUY_WORDS.some(w => typeRaw.includes(w)) ? "compra" : FEE_WORDS.some(w => typeRaw.includes(w)) ? "taxa" : quantity < 0 ? "venda" : "compra";
    const q = Math.abs(quantity);
    if (!date || !asset || !(q > 0) || !(priceEur >= 0)) { skipped++; continue; }
    const curRaw = cCur >= 0 ? (cells[cCur] ?? "").trim().toUpperCase() : "";
    const currency = /^[A-Z]{3}$/.test(curRaw) ? curRaw : undefined;
    const priceInput = cOrig >= 0 ? normNum(cells[cOrig] ?? "") : NaN;
    const feeRaw = cFee >= 0 ? Math.abs(normNum(cells[cFee] ?? "")) : NaN;
    const feeEur = feeRaw > 0 ? feeRaw : undefined;
    const feeAssetRaw = cFeeAsset >= 0 ? (cells[cFeeAsset] ?? "").trim().toUpperCase() : "";
    const feeAsset = /^[A-Z0-9.]{2,12}$/.test(feeAssetRaw) && !/^[A-Z]{3}$/.test(feeAssetRaw) || ["ETH", "SOL", "BNB", "POL", "BTC", "TRX", "ADA", "DOT", "ARB"].includes(feeAssetRaw) ? feeAssetRaw : undefined;
    // fee_original: na moeda (com `currency`) ou, com fee_asset, em unidades do token.
    const feeInput = feeEur !== undefined && cFeeOrig >= 0 && (currency || feeAsset) ? Math.abs(normNum(cells[cFeeOrig] ?? "")) : NaN;
    trades.push({
      id: tradeId(), type, asset, assetName: asset, quantity: q, priceEur, totalEur: q * priceEur, date,
      exchange: cEx >= 0 ? (cells[cEx] ?? "") : "", notes: cNotes >= 0 ? (cells[cNotes] ?? "") : "", updatedAt: Date.now(),
      ...(currency && Number.isFinite(priceInput) ? { currency, priceInput } : {}),
      ...(feeEur !== undefined ? { feeEur, ...(Number.isFinite(feeInput) ? { feeInput, ...(feeAsset ? { feeAsset } : {}) } : {}) } : {}),
    });
  }
  return { trades, skipped };
}
