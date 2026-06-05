"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

type TradeEntry = {
  id: string;
  asset: string;
  type: "compra" | "venda";
  amount: number;
  price: number;
  date: string;
  exchange: string;
};

type TaxEvent = {
  asset: string;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  gain: number;
  holding: "curto" | "longo"; // <365 dias = curto; >=365 = longo
  taxRate: number; // PT: 28% curto, 0% longo (>365 dias, desde 2023 lei PT)
};

// Regras PT 2024: cripto com holding >365 dias = isento; <=365 dias = 28%
const PT_TAX_SHORT = 0.28;
const PT_TAX_LONG = 0.0; // isento

function calcDays(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

const emptyTrade = (): TradeEntry => ({
  id: crypto.randomUUID(),
  asset: "BTC",
  type: "compra",
  amount: 0,
  price: 0,
  date: new Date().toISOString().slice(0, 10),
  exchange: "Binance",
});

export default function FiscalidadePage() {
  const { isLoading } = useRequireAuth("/login");
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [newTrade, setNewTrade] = useState<TradeEntry>(emptyTrade());
  const [country, setCountry] = useState<"PT" | "ES" | "FR" | "DE">("PT");

  const taxRates: Record<string, { short: number; long: number; longDays: number; longLabel: string }> = {
    PT: { short: 0.28, long: 0.0, longDays: 365, longLabel: "Isento (>1 ano)" },
    ES: { short: 0.19, long: 0.23, longDays: 365, longLabel: "23% (>1 ano)" },
    FR: { short: 0.30, long: 0.30, longDays: 0, longLabel: "30% (flat tax)" },
    DE: { short: 0.25, long: 0.0, longDays: 365, longLabel: "Isento (>1 ano)" },
  };
  const regime = taxRates[country];

  // FIFO: calcular eventos de mais-valias
  const taxEvents = useMemo<TaxEvent[]>(() => {
    const events: TaxEvent[] = [];
    const pool: Record<string, Array<{ amount: number; price: number; date: string }>> = {};

    const sorted = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const t of sorted) {
      if (t.type === "compra") {
        if (!pool[t.asset]) pool[t.asset] = [];
        pool[t.asset].push({ amount: t.amount, price: t.price, date: t.date });
      } else {
        // venda — FIFO
        let remaining = t.amount;
        while (remaining > 0 && pool[t.asset]?.length) {
          const lot = pool[t.asset][0];
          const used = Math.min(lot.amount, remaining);
          const days = calcDays(lot.date, t.date);
          const isLong = days >= regime.longDays && regime.longDays > 0;
          const rate = isLong ? regime.long : regime.short;
          const gain = (t.price - lot.price) * used;
          events.push({
            asset: t.asset,
            buyDate: lot.date,
            sellDate: t.date,
            buyPrice: lot.price,
            sellPrice: t.price,
            amount: used,
            gain,
            holding: isLong ? "longo" : "curto",
            taxRate: rate,
          });
          lot.amount -= used;
          remaining -= used;
          if (lot.amount <= 0) pool[t.asset].shift();
        }
      }
    }
    return events;
  }, [trades, regime]);

  const summary = useMemo(() => {
    const totalGain = taxEvents.reduce((s, e) => s + e.gain, 0);
    const taxable = taxEvents.filter(e => e.gain > 0 && e.taxRate > 0).reduce((s, e) => s + e.gain, 0);
    const exempt = taxEvents.filter(e => e.taxRate === 0 && e.gain > 0).reduce((s, e) => s + e.gain, 0);
    const losses = taxEvents.filter(e => e.gain < 0).reduce((s, e) => s + e.gain, 0);
    const tax = taxEvents.filter(e => e.gain > 0).reduce((s, e) => s + e.gain * e.taxRate, 0);
    return { totalGain, taxable, exempt, losses, tax };
  }, [taxEvents]);

  const exportCSV = () => {
    const rows = [
      ["Ativo", "Data compra", "Data venda", "Preço compra", "Preço venda", "Quantidade", "Mais-valia", "Tipo", "Taxa", "Imposto"],
      ...taxEvents.map(e => [
        e.asset, e.buyDate, e.sellDate,
        e.buyPrice.toFixed(2), e.sellPrice.toFixed(2),
        e.amount.toFixed(8), e.gain.toFixed(2),
        e.holding === "longo" ? "Longo prazo" : "Curto prazo",
        `${(e.taxRate * 100).toFixed(0)}%`,
        (Math.max(0, e.gain) * e.taxRate).toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `owlfund-fiscalidade-${country}-${new Date().getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 animate-pulse">A carregar...</p></div>;

  const fmtEur = (v: number) => `€ ${Math.abs(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>
      <div className="relative z-10">
        <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Impostos</p>
              <h1 className="mt-2 text-2xl font-bold text-white">Fiscalidade Europeia</h1>
              <p className="mt-1 text-sm text-slate-400">Calcula mais-valias cripto com regras fiscais do teu país (FIFO).</p>
            </div>
            {/* País */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">País:</span>
              {(["PT", "ES", "FR", "DE"] as const).map(c => (
                <button key={c} onClick={() => setCountry(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${country === c ? "bg-orange-500 text-slate-950" : "border border-slate-700 text-slate-400 hover:border-orange-400/40 hover:text-orange-200"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Regras do país */}
          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Curto prazo (<1 ano)", value: `${(regime.short * 100).toFixed(0)}%`, color: "text-rose-400" },
              { label: "Longo prazo", value: regime.longLabel, color: "text-emerald-400" },
              { label: "Método", value: "FIFO", color: "text-orange-300" },
              { label: "Moeda base", value: "EUR", color: "text-slate-300" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Adicionar transação */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">Adicionar transação</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <select value={newTrade.type} onChange={e => setNewTrade(t => ({ ...t, type: e.target.value as "compra" | "venda" }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                <option value="compra">Compra</option>
                <option value="venda">Venda</option>
              </select>
              <input placeholder="Ativo (BTC, ETH...)" value={newTrade.asset}
                onChange={e => setNewTrade(t => ({ ...t, asset: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="number" placeholder="Quantidade" value={newTrade.amount || ""} min="0" max="999999999" step="any"
                onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setNewTrade(t => ({ ...t, amount: v })); }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="number" placeholder="Preço EUR" value={newTrade.price || ""} min="0" max="999999999" step="any"
                onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setNewTrade(t => ({ ...t, price: v })); }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
              <input type="date" value={newTrade.date}
                onChange={e => setNewTrade(t => ({ ...t, date: e.target.value }))}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500" />
              <button onClick={() => {
                if (!newTrade.asset || newTrade.amount <= 0 || newTrade.price <= 0) return;
                setTrades(prev => [...prev, { ...newTrade, id: crypto.randomUUID() }]);
                setNewTrade(emptyTrade());
              }} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400 transition">
                + Adicionar
              </button>
            </div>
          </div>

          {/* Transações */}
          {trades.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">Transações ({trades.length})</p>
              <div className="space-y-2">
                {[...trades].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-4 py-2.5">
                    <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${t.type === "compra" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                      {t.type.toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-white w-12">{t.asset}</span>
                    <span className="text-sm text-slate-300 flex-1">{t.amount} × € {t.price.toLocaleString("pt-PT")}</span>
                    <span className="text-sm font-semibold text-slate-300">€ {(t.amount * t.price).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}</span>
                    <span className="text-xs text-slate-500">{t.date}</span>
                    <button onClick={() => setTrades(prev => prev.filter(x => x.id !== t.id))}
                      className="text-slate-600 hover:text-rose-400 transition text-sm px-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resultados */}
          {taxEvents.length > 0 && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Mais-valias totais", value: summary.totalGain, color: summary.totalGain >= 0 ? "text-emerald-400" : "text-rose-400" },
                  { label: "Isentas (longo prazo)", value: summary.exempt, color: "text-emerald-300" },
                  { label: "Perdas realizadas", value: summary.losses, color: "text-rose-400" },
                  { label: "Imposto estimado", value: summary.tax, color: "text-orange-400" },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
                    <p className={`text-xl font-bold ${c.color}`}>{fmtEur(c.value)}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Tabela de eventos */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Eventos fiscais ({taxEvents.length})</p>
                  <button onClick={exportCSV}
                    className="flex items-center gap-2 rounded-xl border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/10 transition">
                    ↓ Exportar CSV (IRS)
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-left">
                        {["Ativo", "Compra", "Venda", "Qtd", "P.Compra", "P.Venda", "Mais-valia", "Tipo", "Taxa", "Imposto"].map(h => (
                          <th key={h} className="pb-2 pr-4 font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {taxEvents.map((e, i) => (
                        <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="py-2 pr-4 font-semibold text-white">{e.asset}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.buyDate}</td>
                          <td className="py-2 pr-4 text-slate-400">{e.sellDate}</td>
                          <td className="py-2 pr-4 text-slate-300">{e.amount.toFixed(4)}</td>
                          <td className="py-2 pr-4 text-slate-300">€ {e.buyPrice.toFixed(0)}</td>
                          <td className="py-2 pr-4 text-slate-300">€ {e.sellPrice.toFixed(0)}</td>
                          <td className={`py-2 pr-4 font-semibold ${e.gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {e.gain >= 0 ? "+" : ""}€ {e.gain.toFixed(2)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${e.holding === "longo" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"}`}>
                              {e.holding === "longo" ? "Longo" : "Curto"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-slate-400">{(e.taxRate * 100).toFixed(0)}%</td>
                          <td className={`py-2 font-semibold ${e.gain > 0 && e.taxRate > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {e.gain > 0 && e.taxRate > 0 ? `€ ${(e.gain * e.taxRate).toFixed(2)}` : "Isento"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  ⚠️ <strong className="text-slate-400">Aviso legal:</strong> Este cálculo é meramente indicativo com base nas regras gerais de cada país.
                  Consulta sempre um contabilista ou advogado fiscal para a tua declaração oficial.
                  Regras PT: Lei n.º 24-D/2022, art. 5.º — mais-valias cripto com detenção &gt;365 dias isentas desde 2023.
                </p>
              </div>
            </>
          )}

          {trades.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-sm font-semibold text-white">Sem transações ainda</p>
              <p className="text-xs text-slate-400 mt-1">Adiciona as tuas compras e vendas para calcular o imposto.</p>
            </div>
          )}

        </main>
      </div>
    </div>
    </AppShell>
  );
}
