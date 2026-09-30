"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Segmentos from "@/components/ui/Segmentos";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { ACCOUNTS_EVENT, ALL_ACCOUNTS_ID, getActiveAccountId, listAccounts, type Account } from "@/lib/portfolios/accounts";
import { lerAtivosConta, type AtivosConta, type FonteAtivo } from "@/lib/portfolios/ativosConta";
import { categoryLabel, traditionalAssets } from "@/lib/traditional/assets";

// Aba "O meu portefólio" do Mercado: os ativos da conta escolhida, só para ver.
// Clicar numa linha mostra o gráfico desse ativo por cima da tabela.

type LinhaMercado = { symbol: string; market: string; priceUsd: number; change24h: number; semPar?: boolean };
type Cotacao = { price: number | null; currency?: string | null; changePercent: number | null };

type Props<Q extends Cotacao> = {
  rows: readonly LinhaMercado[];
  cotacoes: Record<string, Q>;
  precoEurDaCotacao: (q?: Q) => number | undefined;
  pedirCotacoes: (simbolos: string[]) => void;
  /** Desenha o gráfico do TradingView para um símbolo (a página tem o widget). */
  grafico: (simbolo: string) => ReactNode;
};

export default function MeusAtivos<Q extends Cotacao>({ rows, cotacoes, precoEurDaCotacao, pedirCotacoes, grafico }: Props<Q>) {
  const { t } = useLanguage();
  const { format: fmtCur, formatUsd, formatMarketUsd: fmtMkt, usdToEur, hideBalances, numberFormat } = useCurrencyFormat();
  const [contas, setContas] = useState<Account[]>([]);
  const [conta, setConta] = useState("");
  const [tipo, setTipo] = useState<"cripto" | "tradicional">("cripto");
  const [ativos, setAtivos] = useState<AtivosConta>({ cripto: [], tradicional: [] });
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const graficoRef = useRef<HTMLDivElement>(null);

  // Contas do navegador; começa na conta ativa (ou "Todas", se for essa).
  useEffect(() => {
    const ler = () => {
      setContas(listAccounts());
      setConta((c) => c || getActiveAccountId());
    };
    ler();
    window.addEventListener(ACCOUNTS_EVENT, ler);
    return () => window.removeEventListener(ACCOUNTS_EVENT, ler);
  }, []);
  useEffect(() => {
    if (!conta) return;
    setAtivos(lerAtivosConta(conta));
    setEscolhido(null);
  }, [conta]);

  const porSimbolo = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);

  const cripto = useMemo(() => ativos.cripto
    .map((a) => {
      const r = porSimbolo.get(a.symbol);
      const valorUsd = r && a.quantidade > 0 ? a.quantidade * r.priceUsd : null;
      // Registos sem quantidade: vale o investido (EUR), como no Portefólio.
      const valorEur = (valorUsd != null ? valorUsd * usdToEur : 0) + a.investidoSemQuantidadeEur;
      return { ...a, linha: r, valorUsd, valorEur };
    })
    .sort((x, y) => y.valorEur - x.valorEur), [ativos.cripto, porSimbolo, usdToEur]);

  const tradicional = useMemo(() => ativos.tradicional
    .map((h) => {
      const asset = traditionalAssets.find((a) => a.id === h.id);
      const q = asset?.alphaSymbol ? cotacoes[asset.alphaSymbol] : undefined;
      const precoEur = precoEurDaCotacao(q);
      const valorEur = h.quantidade != null && precoEur != null ? h.quantidade * precoEur : h.investidoEur;
      return { ...h, asset, cotacao: q, precoEur, valorEur, aMercado: h.quantidade != null && precoEur != null };
    })
    .filter((x) => x.asset)
    .sort((x, y) => y.valorEur - x.valorEur), [ativos.tradicional, cotacoes, precoEurDaCotacao]);

  // Cotações dos tradicionais desta conta (a página só as pedia na aba Tradicional).
  const simbolosCotacao = useMemo(
    () => tradicional.map((x) => x.asset?.alphaSymbol).filter((s): s is string => !!s).sort().join(","),
    [tradicional],
  );
  useEffect(() => {
    if (tipo === "tradicional" && simbolosCotacao) pedirCotacoes(simbolosCotacao.split(","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, simbolosCotacao]);

  // Símbolo do gráfico: o escolhido ou o de maior valor.
  const simboloGrafico = useMemo(() => {
    if (tipo === "cripto") {
      const s = escolhido && cripto.some((c) => c.symbol === escolhido) ? escolhido : cripto[0]?.symbol;
      if (!s) return { nome: null, tv: null };
      if (s === "USDT") return { nome: s, tv: "KRAKEN:USDTUSD" };
      const r = porSimbolo.get(s);
      if (r?.semPar) return { nome: s, tv: null };
      return { nome: s, tv: `BINANCE:${r?.market ?? `${s}USDT`}` };
    }
    const x = (escolhido ? tradicional.find((c) => c.id === escolhido) : null) ?? tradicional[0];
    if (!x) return { nome: null, tv: null };
    return { nome: x.asset?.label ?? x.id, tv: x.asset?.tvSymbol ?? null };
  }, [tipo, escolhido, cripto, tradicional, porSimbolo]);

  const escolher = (id: string) => {
    setEscolhido(id);
    graficoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const qtd = (n: number) => (hideBalances ? "••••" : n.toLocaleString(numberFormat, { maximumFractionDigits: 8 }));
  const pctTxt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
  const pctCor = (n: number | null | undefined) => (n == null ? "text-slate-500" : n >= 0 ? "text-emerald-400" : "text-rose-400");
  const FONTE: Record<FonteAtivo, string> = {
    carteira: t("mc_pf_src_wallet"), estavel: t("mc_pf_src_stable"), manual: t("mc_pf_src_manual"), exchange: t("mc_pf_src_exchange"),
  };
  const vazio = tipo === "cripto" ? cripto.length === 0 : tradicional.length === 0;

  return (
    <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("mc_pf_title")}</h2>
          <p className="text-sm text-slate-400">{t("mc_pf_hint")}</p>
        </div>
        <Segmentos tamanho="sm" valor={tipo} aoMudar={(v) => { setTipo(v); setEscolhido(null); }}
          opcoes={[{ id: "cripto", label: t("mc_pf_crypto") }, { id: "tradicional", label: t("mc_pf_traditional") }]} />
      </div>
      {contas.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{t("mc_pf_account")}:</span>
          <Segmentos tamanho="sm" wrap valor={conta} aoMudar={setConta}
            opcoes={[...contas.map((c) => ({ id: c.id, label: c.name })), { id: ALL_ACCOUNTS_ID, label: t("mc_pf_all") }]} />
        </div>
      )}

      {vazio ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-center text-sm text-slate-400">
          <p>{tipo === "cripto" ? t("mc_pf_empty_crypto") : t("mc_pf_empty_trad")}</p>
          <a href="/wallets" className="mt-3 inline-block rounded-xl border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 hover:bg-orange-500/10">
            {t("nav_wallets")} →
          </a>
        </div>
      ) : (
        <>
          <div ref={graficoRef} className="mt-5 scroll-mt-24">
            <p className="mb-2 text-sm text-slate-300">
              {simboloGrafico.nome}{simboloGrafico.tv ? <span className="ml-2 text-xs text-slate-500">{simboloGrafico.tv}</span> : null}
            </p>
            <div className="h-[420px] rounded-xl border border-slate-800 bg-slate-950/50 p-1 sm:h-[480px]">
              {simboloGrafico.tv ? grafico(simboloGrafico.tv) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                  {tipo === "cripto" ? t("mc_no_pair_chart").replace("{s}", simboloGrafico.nome ?? "") : t("mc_no_symbol")}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            {tipo === "cripto" ? (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-3">{t("mc_pf_asset")}</th>
                    <th className="pb-2 pr-3">{t("mc_pf_source")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_qty")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_price")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_value")}</th>
                    <th className="pb-2 text-right">24h</th>
                  </tr>
                </thead>
                <tbody>
                  {cripto.map((c) => {
                    const ativo = (simboloGrafico.nome === c.symbol);
                    return (
                      <tr key={c.symbol} onClick={() => escolher(c.symbol)}
                        className={`cursor-pointer border-t border-slate-800/80 transition ${ativo ? "bg-orange-500/10" : "hover:bg-slate-800/40"}`}>
                        <td className="py-2 pr-3 font-semibold text-white">{c.symbol}</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">{c.fontes.map((f) => FONTE[f]).join(" · ")}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{c.quantidade > 0 ? qtd(c.quantidade) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{c.linha ? fmtMkt(c.linha.priceUsd, { decimals: c.linha.priceUsd < 1 ? 6 : 2 }) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-white">
                          {c.valorUsd != null ? formatUsd(c.valorUsd) : c.investidoSemQuantidadeEur > 0 ? fmtCur(c.investidoSemQuantidadeEur) : "—"}
                          {c.valorUsd == null && c.investidoSemQuantidadeEur > 0 && <span className="ml-1 text-[10px] text-slate-500">{t("mc_pf_invested_tag")}</span>}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${pctCor(c.linha?.change24h)}`}>{pctTxt(c.linha?.change24h)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-3">{t("mc_pf_asset")}</th>
                    <th className="pb-2 pr-3">{t("mc_pf_category")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_qty")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_quote")}</th>
                    <th className="pb-2 pr-3 text-right">{t("mc_pf_value")}</th>
                    <th className="pb-2 text-right">{t("mc_pf_day")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tradicional.map((x) => {
                    const ativo = simboloGrafico.nome === (x.asset?.label ?? x.id);
                    return (
                      <tr key={x.id} onClick={() => escolher(x.id)}
                        className={`cursor-pointer border-t border-slate-800/80 transition ${ativo ? "bg-orange-500/10" : "hover:bg-slate-800/40"}`}>
                        <td className="py-2 pr-3 font-semibold text-white">{x.asset?.label ?? x.id}</td>
                        <td className="py-2 pr-3 text-xs text-slate-400">{x.asset ? categoryLabel(x.asset.category, t) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{x.quantidade != null ? qtd(x.quantidade) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">
                          {x.cotacao?.price != null ? `${x.cotacao.price.toLocaleString(numberFormat, { maximumFractionDigits: 2 })} ${(x.cotacao.currency ?? "USD").toUpperCase()}` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-white">
                          {fmtCur(x.valorEur)}
                          {!x.aMercado && <span className="ml-1 text-[10px] text-slate-500">{t("mc_pf_invested_tag")}</span>}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${pctCor(x.cotacao?.changePercent)}`}>{pctTxt(x.cotacao?.changePercent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-4 text-xs text-slate-500">{tipo === "cripto" ? t("mc_pf_note_crypto") : t("mc_pf_note_trad")}</p>
        </>
      )}
    </section>
  );
}
