"use client";

// Corretoras sem API, e registo manual para todas.
//
// Duas portas para o mesmo sítio: escolhe-se a corretora numa grelha e ou se
// escreve moeda + quantidade à mão, ou — na app Crypto.com, que não tem API —
// importa-se o CSV que a própria app exporta. Do CSV sai o saldo e saem as
// transações para o relatório fiscal. Tudo fica por conta e sincroniza como o
// resto (ver src/lib/venues/manualVenues.ts).
import { useEffect, useMemo, useRef, useState } from "react";

import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { importarCryptocomApp, type ImportacaoCryptocom } from "@/lib/imports/cryptocomApp";
import { loadTrades, writeTradesRaw, type Trade } from "@/lib/portfolios/trades";
import { pushWalletCloud } from "@/lib/portfolios/cloudSync";
import { VENUES, loadVenueHoldings, saveVenueHoldings, venueId, type VenueAsset, type VenueHolding } from "@/lib/venues/manualVenues";

type Linha = { asset: string; qty: string };

export default function VenueSection({ onTotalChange, usdToEur = 0.92 }: { onTotalChange?: (usd: number) => void; usdToEur?: number }) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();

  const [lista, setLista] = useState<VenueHolding[]>([]);
  const [pronto, setPronto] = useState(false);
  const [aAdicionar, setAAdicionar] = useState(false);
  const [venue, setVenue] = useState<string | null>(null);
  const [rotulo, setRotulo] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([{ asset: "", qty: "" }]);
  const [precos, setPrecos] = useState<Record<string, number>>({});
  const [importacao, setImportacao] = useState<ImportacaoCryptocom | null>(null);
  const [erroFicheiro, setErroFicheiro] = useState<string | null>(null);
  // Entrada que esta a ser actualizada (substitui-se ao guardar, em vez de acrescentar).
  const [aAtualizar, setAAtualizar] = useState<string | null>(null);
  const DIAS_ANTIGO = 30;
  const diasDesde = (ts: number) => Math.floor((Date.now() - ts) / 86_400_000);

  // "Este saldo tem N dias, queres actualizar?" — abre o formulario ja preenchido.
  const abrirAtualizar = (v: VenueHolding) => {
    setAAdicionar(true); setVenue(v.venue); setRotulo(v.label ?? ""); setAAtualizar(v.id);
    setLinhas(v.assets.length ? v.assets.map((a) => ({ asset: a.asset, qty: String(a.qty) })) : [{ asset: "", qty: "" }]);
    setImportacao(null); setErroFicheiro(null);
  };
  const ficheiroRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLista(loadVenueHoldings()); setPronto(true); }, []);
  useEffect(() => { if (pronto) saveVenueHoldings(lista); }, [lista, pronto]);

  const simbolos = useMemo(() => Array.from(new Set(lista.flatMap((v) => v.assets.map((a) => a.asset)))).sort(), [lista]);
  useEffect(() => {
    if (simbolos.length === 0) return;
    fetch(`/api/token-prices?symbols=${simbolos.join(",")}`)
      .then((r) => r.json())
      .then((d: { prices?: Record<string, number> }) => { if (d.prices) setPrecos(d.prices); })
      .catch(() => {});
  }, [simbolos.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorUsd = (assets: VenueAsset[]) => assets.reduce((s, a) => s + a.qty * (precos[a.asset] ?? 0), 0);
  const totalUsd = useMemo(() => lista.reduce((s, v) => s + valorUsd(v.assets), 0), [lista, precos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onTotalChange?.(totalUsd); }, [totalUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  const venueInfo = (id: string) => VENUES.find((v) => v.id === id);
  const escolhida = venue ? venueInfo(venue) : null;

  const fechar = () => { setAAdicionar(false); setVenue(null); setRotulo(""); setLinhas([{ asset: "", qty: "" }]); setImportacao(null); setErroFicheiro(null); setAAtualizar(null); };

  const guardarManual = () => {
    if (!venue) return;
    const assets = linhas
      .map((l) => ({ asset: l.asset.trim().toUpperCase(), qty: Number(String(l.qty).replace(",", ".")) }))
      .filter((a) => a.asset && Number.isFinite(a.qty) && a.qty > 0);
    if (assets.length === 0) return;
    const nova: VenueHolding = { id: aAtualizar ?? venueId(), venue, label: rotulo.trim() || undefined, assets, source: "manual", updatedAt: Date.now() };
    setLista((prev) => (aAtualizar ? prev.map((v) => (v.id === aAtualizar ? nova : v)) : [...prev, nova]));
    fechar();
    pushWalletCloud();
  };

  const lerFicheiro = async (f: File) => {
    setErroFicheiro(null);
    const texto = await f.text();
    const r = importarCryptocomApp(texto);
    if (r.erro) { setErroFicheiro(r.erro === "colunas" ? t("vn_csv_err_cols") : t("vn_csv_err_empty")); setImportacao(null); return; }
    setImportacao(r);
  };

  const confirmarImportacao = () => {
    if (!importacao || !venue) return;
    const assets = Object.entries(importacao.saldos).filter(([, q]) => q > 0).map(([asset, qty]) => ({ asset, qty }));
    // A importação substitui a entrada anterior da mesma corretora (é o saldo inteiro, não um acréscimo).
    setLista((prev) => [...prev.filter((v) => !(v.venue === venue && v.source === "csv")), { id: venueId(), venue, label: rotulo.trim() || undefined, assets, source: "csv", updatedAt: Date.now() }]);
    // Transações para a fiscalidade — sem duplicar as que já lá estão.
    const existentes = loadTrades();
    const chave = (x: Trade) => `${x.asset}|${x.date}|${x.type}|${x.quantity}|${x.priceEur}|${x.exchange}`;
    const ja = new Set(existentes.map(chave));
    const novas = importacao.trades.filter((x) => !ja.has(chave(x)));
    if (novas.length > 0) writeTradesRaw([...novas, ...existentes]);
    fechar();
    pushWalletCloud();
  };

  const remover = (id: string) => { setLista((prev) => prev.filter((v) => v.id !== id)); pushWalletCloud(); };

  const nTrades = importacao?.trades.length ?? 0;
  const nMoedas = importacao ? Object.values(importacao.saldos).filter((q) => q > 0).length : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("vn_title")}</p>
          <p className="text-sm text-slate-300 mt-0.5">{t("vn_subtitle")}</p>
        </div>
        <button type="button" onClick={() => (aAdicionar ? fechar() : setAAdicionar(true))}
          className="rounded-xl bg-orange-500/90 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">
          {t("vn_add")}
        </button>
      </div>

      {aAdicionar && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-4">
          {/* Grelha de corretoras */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vn_pick")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {VENUES.map((v) => (
                <button key={v.id} type="button" onClick={() => { setVenue(v.id); setImportacao(null); setErroFicheiro(null); }}
                  className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${venue === v.id ? "border-orange-400 bg-orange-500/15 text-orange-100" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                  <span className="block font-semibold">{v.id === "outra" ? t("vn_other") : v.label}</span>
                  <span className="block text-[11px] text-slate-500">
                    {v.csv ? t("vn_tag_csv") : v.api ? t("vn_tag_api_or_manual") : t("vn_tag_manual")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {escolhida && (
            <div className="space-y-3">
              <input type="text" value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder={t("vn_label_ph")}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-400/60" />

              {escolhida.csv === "cryptocom-app" && (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-sky-300">{t("vn_csv_title")}</p>
                  <ol className="space-y-0.5 text-[11px] text-slate-300">
                    <li>1. {t("vn_csv_s1")}</li>
                    <li>2. {t("vn_csv_s2")}</li>
                    <li>3. {t("vn_csv_s3")}</li>
                  </ol>
                  <input ref={ficheiroRef} type="file" accept=".csv,text/csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerFicheiro(f); e.target.value = ""; }} />
                  <button type="button" onClick={() => ficheiroRef.current?.click()} className={`${btnPrimary} px-3 py-1.5 text-xs`}>{t("vn_csv_pick")}</button>
                  {erroFicheiro && <p className="text-[11px] text-rose-300">{erroFicheiro}</p>}
                  {importacao && (
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[11px] text-slate-300 space-y-1">
                      <p className="font-semibold text-white">{t("vn_csv_preview")}</p>
                      <p>{t("vn_csv_lines").replace("{n}", String(importacao.linhas)).replace("{i}", String(importacao.ignoradas))}</p>
                      {importacao.periodo && <p>{t("vn_csv_period").replace("{a}", importacao.periodo.de).replace("{b}", importacao.periodo.ate)}</p>}
                      <p>{t("vn_csv_found").replace("{m}", String(nMoedas)).replace("{t}", String(nTrades))}</p>
                      {importacao.moedaNativa && importacao.moedaNativa !== "EUR" && (
                        <p className="text-amber-300">{t("vn_csv_currency").replace("{c}", importacao.moedaNativa)}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(importacao.saldos).filter(([, q]) => q > 0).slice(0, 12).map(([a, q]) => (
                          <span key={a} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px]"><b>{a}</b> {q.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="button" onClick={confirmarImportacao} className={`${btnPrimary} px-3 py-1.5 text-xs`}>{t("vn_csv_confirm")}</button>
                        <button type="button" onClick={() => setImportacao(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400">{t("vn_cancel")}</button>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">{t("vn_csv_or_manual")}</p>
                </div>
              )}

              {escolhida.api && (
                <p className="text-[11px] text-slate-500">{t("vn_api_hint")}</p>
              )}

              {/* Registo manual: moeda + quantidade, uma linha por moeda */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("vn_manual_title")}</p>
                {linhas.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={l.asset} placeholder={t("vn_asset_ph")}
                      onChange={(e) => setLinhas((prev) => prev.map((x, j) => (j === i ? { ...x, asset: e.target.value.toUpperCase() } : x)))}
                      className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs uppercase text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-400/60" />
                    <input type="text" inputMode="decimal" value={l.qty} placeholder={l.asset.trim() ? t("vn_qty_ph_asset").replace("{a}", l.asset.trim().toUpperCase()) : t("vn_qty_ph")}
                      onChange={(e) => setLinhas((prev) => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-400/60" />
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => setLinhas((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-slate-500 hover:text-rose-400">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setLinhas((prev) => [...prev, { asset: "", qty: "" }])} className="text-[11px] text-orange-300 hover:text-orange-200">{t("vn_add_row")}</button>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={guardarManual}
                  disabled={!linhas.some((l) => l.asset.trim() && Number(String(l.qty).replace(",", ".")) > 0)}
                  className={`${btnPrimary} px-4 py-2 text-xs`}>{t("vn_save")}</button>
                <button type="button" onClick={fechar} className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:border-slate-500 transition">{t("vn_cancel")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {pronto && lista.length === 0 && !aAdicionar && (
        <p className="text-xs text-slate-600">{t("vn_empty")}</p>
      )}

      <div className="space-y-3">
        {lista.map((v) => {
          const info = venueInfo(v.venue);
          const usd = valorUsd(v.assets);
          return (
            <div key={v.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{v.label ?? (info?.id === "outra" ? t("vn_other") : info?.label ?? v.venue)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    {v.source === "csv" ? t("vn_src_csv") : t("vn_src_manual")} · {new Date(v.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => abrirAtualizar(v)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-orange-400/60 transition">{t("vn_update")}</button>
                  <button type="button" onClick={() => remover(v.id)} className="text-xs text-slate-600 hover:text-rose-400 transition">{t("vn_remove")}</button>
                </div>
              </div>
              {diasDesde(v.updatedAt) >= DIAS_ANTIGO && (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  {t("vn_stale").replace("{n}", String(diasDesde(v.updatedAt)))}{" "}
                  <button type="button" onClick={() => abrirAtualizar(v)} className="font-semibold underline">{t("vn_stale_cta")}</button>
                </p>
              )}
              {v.assets.length === 0 ? (
                <p className="text-xs text-slate-500">{t("vn_no_assets")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {v.assets.map((a) => {
                    const p = precos[a.asset];
                    const eur = p != null ? a.qty * p * usdToEur : null;
                    return (
                      <div key={a.asset} className="rounded-lg bg-slate-900 px-3 py-2 text-xs">
                        <p className="font-bold text-white">{a.asset}</p>
                        <p className="text-slate-400">{hideBalances ? "••••" : a.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p>
                        {eur != null && eur > 0.001 && <p className="mt-0.5 text-[11px] text-emerald-400/80">{fmtCur(eur)}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              {v.assets.length > 0 && (
                <div className="mt-3 flex items-center justify-end gap-1.5">
                  <span className="text-xs text-slate-500">{t("cx_total")}</span>
                  <span className="text-sm font-bold text-white">{usd > 0 ? fmtCur(usd * usdToEur) : <span className="animate-pulse text-xs text-slate-600">{t("cx_calculating")}</span>}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
