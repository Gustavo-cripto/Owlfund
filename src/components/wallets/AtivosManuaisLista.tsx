"use client";

import EmptyState from "@/components/EmptyState";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { cryptoHoldingValueEur, linhasManuais, type CarteiraManual, type CryptoHoldings } from "@/lib/crypto/storage";
import type { MarketRow, MoneyFieldFn, QtyFieldFn } from "@/lib/wallets/tipos";

// Ativos cripto registados à mão: um cartão por ativo com os totais (quantidade,
// valor atual, investido, preço médio, ganho) e, por baixo, uma linha por
// carteira onde ele está (nome, quantidade, investido, data). O estado vive na
// página das Carteiras.
type Props = {
  marketRows: MarketRow[];
  cryptoHoldings: CryptoHoldings;
  adicionarCarteira: (symbol: string, linha?: Omit<CarteiraManual, "id">) => void;
  atualizarCarteira: (symbol: string, id: string, patch: Partial<Omit<CarteiraManual, "id">>) => void;
  removerCarteira: (symbol: string, id: string) => void;
  removerAtivo: (symbol: string) => void;
  semAtivos: boolean;
  sortedCryptoSymbols: string[];
  cryptoPrices: Record<string, MarketRow>;
  moneyField: MoneyFieldFn;
  qtyField: QtyFieldFn;
};

export default function AtivosManuaisLista({
  marketRows, cryptoHoldings, adicionarCarteira, atualizarCarteira, removerCarteira, removerAtivo,
  semAtivos, sortedCryptoSymbols, cryptoPrices, moneyField, qtyField,
}: Props) {
  const { t } = useLanguage();
  // O valor usa a MESMA conversão USD→moeda que o preço mostrado (formatMarketUsd):
  // antes usava outra taxa e 0,131402 × $2.710,69 aparecia como $358,11.
  const { format: fmtCur, formatSigned, symbol: curSym, formatMarketUsd: fmtMkt, usdToEur, hideBalances, numberFormat } = useCurrencyFormat();
  const confirmar = useConfirm();
  const hoje = new Date().toISOString().slice(0, 10);
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toLocaleString(numberFormat, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const qtd = (x: number) => (hideBalances ? "••••" : x.toLocaleString(numberFormat, { maximumFractionDigits: 8 }));

  // Ganho de um conjunto de carteiras: só as que têm quantidade E investido contam.
  const ganho = (linhas: CarteiraManual[], precoEur: number | null) => {
    const comAmbos = linhas.filter((l) => (l.quantity ?? 0) > 0 && (l.buyValue ?? 0) > 0);
    if (precoEur == null || !comAmbos.length) return null;
    const inv = comAmbos.reduce((s, l) => s + (l.buyValue ?? 0), 0);
    const val = comAmbos.reduce((s, l) => s + (l.quantity ?? 0) * precoEur, 0);
    return { eur: val - inv, pct: ((val - inv) / inv) * 100, parcial: comAmbos.length < linhas.length };
  };

  return (
    <>
      {/* Adicionar ativo manual (rápido): cria o ativo com uma carteira vazia, ou mais uma carteira se já existir. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <select
          value=""
          aria-label={t("wl_add_manual_asset")}
          onChange={(e) => { const s = e.target.value; if (s) adicionarCarteira(s); }}
          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none hover:border-orange-400 transition cursor-pointer"
        >
          <option value="">{t("wl_add_manual_asset")}</option>
          {marketRows.map((r) => (
            <option key={r.symbol} value={r.symbol}>{r.symbol} · {r.name}{cryptoHoldings[r.symbol] ? ` (${t("wl_add_another_wallet")})` : ""}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-600">{t("wl_reg_no_wallet")}</span>
      </div>
      {semAtivos ? (
        <EmptyState compact icon="🪙" title={t("wl_no_asset_added")} description={t("wl_use_selector")} />
      ) : (
        sortedCryptoSymbols.map((symbol) => {
          const holding = cryptoHoldings[symbol] ?? {};
          const linhas = linhasManuais(holding);
          const market = cryptoPrices[symbol];
          const precoEur = market?.priceUsd ? market.priceUsd * usdToEur : null;
          const valorEur = cryptoHoldingValueEur(holding, precoEur ?? undefined);
          const qtdTotal = holding.quantity ?? 0;
          const investido = holding.buyValue ?? 0;
          const g = ganho(linhas, precoEur);
          const linhasComAmbos = linhas.filter((l) => (l.quantity ?? 0) > 0 && (l.buyValue ?? 0) > 0);
          const qtdComCusto = linhasComAmbos.reduce((s, l) => s + (l.quantity ?? 0), 0);
          const medio = qtdComCusto > 0 ? linhasComAmbos.reduce((s, l) => s + (l.buyValue ?? 0), 0) / qtdComCusto : null;
          return (
            <div key={symbol} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-100">
              {/* Cabeçalho: ativo e totais */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{symbol}</p>
                  <p className="text-slate-500">{market?.name ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pilula rotulo={t("wl_current_price")} valor={market ? fmtMkt(market.priceUsd, { decimals: market.priceUsd < 1 ? 6 : 2 }) : "—"} />
                  {qtdTotal > 0 && <Pilula rotulo={t("wl_total_qty")} valor={`${qtd(qtdTotal)} ${symbol}`} />}
                  {valorEur > 0 && <Pilula rotulo={t("wl_market_value")} valor={fmtCur(valorEur)} forte />}
                  {investido > 0 && <Pilula rotulo={t("wl_invested")} valor={fmtCur(investido)} />}
                  {medio != null && <Pilula rotulo={t("wl_avg_buy_price")} valor={fmtCur(medio, { decimals: medio < 1 ? 6 : 2 })} />}
                  {g && (
                    <span className={`rounded-full border px-3 py-1.5 font-semibold ${g.eur >= 0 ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300" : "border-rose-800/50 bg-rose-950/30 text-rose-300"}`}
                      title={g.parcial ? t("wl_pnl_partial") : undefined}>
                      {t("wl_pnl")}: {formatSigned(g.eur)}{hideBalances ? "" : ` (${pct(g.pct)})`}{g.parcial ? " *" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Uma linha por carteira */}
              <div className="mt-3 space-y-2">
                {linhas.map((l) => {
                  const valorLinha = (l.quantity ?? 0) > 0 && precoEur != null ? (l.quantity ?? 0) * precoEur : null;
                  const gl = ganho([l], precoEur);
                  return (
                    <div key={l.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 p-2.5">
                      <Campo rotulo={t("wl_wallet_name")}>
                        <input
                          key={`n:${l.nome ?? ""}`}
                          type="text"
                          maxLength={40}
                          defaultValue={l.nome ?? ""}
                          placeholder={t("wl_wallet_name_ph")}
                          aria-label={`${t("wl_wallet_name")} ${symbol}`}
                          onBlur={(e) => { const v = e.target.value.trim().slice(0, 40); if (v !== (l.nome ?? "")) atualizarCarteira(symbol, l.id, { nome: v || undefined }); }}
                          className="w-36 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 transition focus:border-orange-400"
                        />
                      </Campo>
                      <Campo rotulo={`${t("wl_quantity")} (${symbol})`} titulo={t("wl_qty_hint")}>
                        {qtyField({ value: l.quantity, onValue: (v) => atualizarCarteira(symbol, l.id, { quantity: v && v > 0 ? v : undefined }), placeholder: "0,5", title: t("wl_qty_hint"), width: "w-28", ariaLabel: `${t("wl_quantity")} ${symbol}` })}
                      </Campo>
                      <Campo rotulo={`${t("wl_invested")} (${curSym})`}>
                        {moneyField({ eur: l.buyValue, onEur: (v) => atualizarCarteira(symbol, l.id, { buyValue: v && v > 0 ? v : undefined }), placeholder: "200", width: "w-28", ariaLabel: `${t("wl_invested")} ${symbol}` })}
                      </Campo>
                      <Campo rotulo={t("wl_buy_date")}>
                        <input
                          type="date"
                          max={hoje}
                          value={l.buyDate ?? ""}
                          aria-label={`${t("wl_buy_date")} ${symbol}`}
                          onChange={(e) => { const v = e.target.value; if (!v || v <= hoje) atualizarCarteira(symbol, l.id, { buyDate: v || undefined }); }}
                          className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                        />
                      </Campo>
                      <div className="flex min-h-[34px] items-center gap-2 px-1 text-[11px] text-slate-400">
                        {valorLinha != null && <span>{fmtCur(valorLinha)}</span>}
                        {gl && <span className={gl.eur >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatSigned(gl.eur)}{hideBalances ? "" : ` (${pct(gl.pct)})`}</span>}
                        {(l.quantity ?? 0) > 0 && (l.buyValue ?? 0) > 0 && !hideBalances && (
                          <span className="text-slate-500">{t("wl_paid_per_unit")} {fmtCur((l.buyValue ?? 0) / (l.quantity ?? 1), { decimals: (l.buyValue ?? 0) / (l.quantity ?? 1) < 1 ? 6 : 2 })}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        title={t("wl_remove_wallet_row")}
                        aria-label={`${t("wl_remove_wallet_row")} ${l.nome ?? ""}`}
                        onClick={async () => {
                          const temDados = (l.quantity ?? 0) > 0 || (l.buyValue ?? 0) > 0;
                          if (temDados && !(await confirmar({ message: t("wl_remove_wallet_row_confirm").replace("{w}", l.nome || symbol), danger: true, okLabel: t("remove") }))) return;
                          removerCarteira(symbol, l.id);
                        }}
                        className="ml-auto rounded-full border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => adicionarCarteira(symbol)}
                  className="rounded-full border border-orange-400/40 px-3 py-1.5 text-[11px] font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
                >
                  + {t("wl_add_wallet_row")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await confirmar({ message: t("wl_remove_asset_confirm").replace("{s}", symbol), danger: true, okLabel: t("remove") }))) return;
                    removerAtivo(symbol);
                  }}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-rose-500/60 hover:text-rose-200"
                >
                  {t("wl_remove_asset")}
                </button>
                {g?.parcial && <span className="text-[11px] text-slate-500">* {t("wl_pnl_partial")}</span>}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function Pilula({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-slate-300">
      {rotulo.replace(/:$/, "")}: <span className={`font-semibold ${forte ? "text-white" : "text-slate-100"}`}>{valor}</span>
    </span>
  );
}

function Campo({ rotulo, titulo, children }: { rotulo: string; titulo?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="px-1 text-[11px] text-slate-500" title={titulo}>{rotulo}</label>
      {children}
    </div>
  );
}
