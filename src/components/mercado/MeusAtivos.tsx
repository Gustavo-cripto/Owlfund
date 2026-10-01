"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Segmentos from "@/components/ui/Segmentos";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { ACCOUNTS_EVENT, ALL_ACCOUNTS_ID, getActiveAccountId, listAccounts, type Account } from "@/lib/portfolios/accounts";
import { ganhoAtivo, juntarVivos, lerAtivosConta, type AtivosConta, type FonteAtivo } from "@/lib/portfolios/ativosConta";
import { lerSaldosExchanges, lerTokensFrias, type SaldoVivo } from "@/lib/portfolios/saldosVivos";
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
  const { format: fmtCur, formatSigned, formatUsd, formatMarketUsd: fmtMkt, usdToEur, hideBalances, numberFormat } = useCurrencyFormat();
  const [contas, setContas] = useState<Account[]>([]);
  const [conta, setConta] = useState("");
  const [tipo, setTipo] = useState<"cripto" | "tradicional">("cripto");
  const [ativos, setAtivos] = useState<AtivosConta>({ cripto: [], tradicional: [], frias: [], temExchanges: false });
  // Saldos lidos em direto (só ficam guardados em total): exchanges por API e tokens frios.
  const [vivos, setVivos] = useState<{ exchanges: SaldoVivo[]; tokens: SaldoVivo[]; aLer: boolean; falhas: number }>({ exchanges: [], tokens: [], aLer: false, falhas: 0 });
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

  useEffect(() => {
    let vivo = true;
    const precisa = ativos.temExchanges || ativos.frias.length > 0;
    if (!precisa) { setVivos({ exchanges: [], tokens: [], aLer: false, falhas: 0 }); return; }
    setVivos((v) => ({ ...v, aLer: true }));
    Promise.all([
      ativos.temExchanges ? lerSaldosExchanges() : Promise.resolve({ saldos: [], falhas: 0 }),
      ativos.frias.length ? lerTokensFrias(ativos.frias) : Promise.resolve({ saldos: [], falhas: 0 }),
    ]).then(([e, k]) => {
      if (vivo) setVivos({ exchanges: e.saldos, tokens: k.saldos, aLer: false, falhas: e.falhas + k.falhas });
    });
    return () => { vivo = false; };
  }, [ativos]);

  const porSimbolo = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  // Valor em USD dado pela rede para tokens fora do top 200 (sem preço na tabela).
  const usdTokens = useMemo(() => new Map(vivos.tokens.filter((x) => x.usd != null).map((x) => [x.symbol, x.usd as number])), [vivos.tokens]);
  const criptoTodas = useMemo(
    () => juntarVivos(juntarVivos(ativos.cripto, vivos.exchanges, "exchangeApi"), vivos.tokens, "tokenFrio"),
    [ativos.cripto, vivos.exchanges, vivos.tokens],
  );

  const cripto = useMemo(() => criptoTodas
    .map((a) => {
      const r = porSimbolo.get(a.symbol);
      const valorUsd = r && a.quantidade > 0 ? a.quantidade * r.priceUsd : usdTokens.get(a.symbol) ?? null;
      // Registos sem quantidade: vale o investido (EUR), como no Portefólio.
      const valorEur = (valorUsd != null ? valorUsd * usdToEur : 0) + a.investidoSemQuantidadeEur;
      return { ...a, linha: r, valorUsd, valorEur };
    })
    .sort((x, y) => y.valorEur - x.valorEur), [criptoTodas, porSimbolo, usdToEur, usdTokens]);

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

  const FONTE: Record<FonteAtivo, string> = {
    carteira: t("mc_pf_src_wallet"), estavel: t("mc_pf_src_stable"), manual: t("mc_pf_src_manual"), exchange: t("mc_pf_src_exchange"),
    exchangeApi: t("mc_pf_src_exchange_api"), tokenFrio: t("mc_pf_src_cold_token"),
  };
  // Linhas para desenhar (tabela e cartões), iguais para cripto e tradicional.
  type Linha = {
    id: string; nome: string; sub: string; qtd: number | null; preco: string; valorEur: number; valorTxt: string;
    soInvestido: boolean; variacao: number | null; medio: string | null; ganhoEur: number | null; ganhoPct: number | null; parcial: boolean;
  };
  const linhas = useMemo<Linha[]>(() => {
    if (tipo === "cripto") {
      return cripto.map((c) => {
        const precoEur = c.linha ? c.linha.priceUsd * usdToEur : null;
        const g = ganhoAtivo(c, precoEur);
        return {
          id: c.symbol, nome: c.symbol, sub: c.fontes.map((f) => FONTE[f]).join(" · "),
          qtd: c.quantidade > 0 ? c.quantidade : null,
          preco: c.linha ? fmtMkt(c.linha.priceUsd, { decimals: c.linha.priceUsd < 1 ? 6 : 2 }) : "—",
          valorEur: c.valorEur,
          valorTxt: c.valorUsd != null ? formatUsd(c.valorUsd) : c.investidoSemQuantidadeEur > 0 ? fmtCur(c.investidoSemQuantidadeEur) : "—",
          soInvestido: c.valorUsd == null && c.investidoSemQuantidadeEur > 0,
          variacao: c.linha?.change24h ?? null,
          medio: g ? fmtCur(g.medio, { decimals: g.medio < 1 ? 6 : 2 }) : null,
          ganhoEur: g?.ganhoEur ?? null, ganhoPct: g?.pct ?? null, parcial: !!g?.parcial,
        };
      });
    }
    return tradicional.map((x) => {
      const ganho = x.aMercado && x.investidoEur > 0 ? x.valorEur - x.investidoEur : null;
      return {
        id: x.id, nome: x.asset?.label ?? x.id, sub: x.asset ? categoryLabel(x.asset.category, t) : "—",
        qtd: x.quantidade,
        preco: x.cotacao?.price != null ? `${x.cotacao.price.toLocaleString(numberFormat, { maximumFractionDigits: 2 })} ${(x.cotacao.currency ?? "USD").toUpperCase()}` : "—",
        valorEur: x.valorEur, valorTxt: fmtCur(x.valorEur), soInvestido: !x.aMercado,
        variacao: x.cotacao?.changePercent ?? null,
        medio: x.quantidade && x.investidoEur > 0 ? fmtCur(x.investidoEur / x.quantidade) : null,
        ganhoEur: ganho, ganhoPct: ganho != null ? (ganho / x.investidoEur) * 100 : null, parcial: false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, cripto, tradicional, usdToEur, fmtCur, fmtMkt, formatUsd, numberFormat, t]);
  const total = useMemo(() => {
    const valor = linhas.reduce((s, l) => s + l.valorEur, 0);
    const comGanho = linhas.filter((l) => l.ganhoEur != null);
    return {
      valor,
      ganho: comGanho.length ? comGanho.reduce((s, l) => s + (l.ganhoEur ?? 0), 0) : null,
      parcial: linhas.some((l) => l.parcial) || (comGanho.length > 0 && comGanho.length < linhas.length),
    };
  }, [linhas]);
  const peso = (v: number) => (total.valor > 0 ? `${((v / total.valor) * 100).toFixed(1)}%` : "—");
  const ganhoTxt = (l: Pick<Linha, "ganhoEur" | "ganhoPct" | "parcial">) =>
    l.ganhoEur == null ? "—" : `${formatSigned(l.ganhoEur)}${l.ganhoPct != null && !hideBalances ? ` (${l.ganhoPct >= 0 ? "+" : ""}${l.ganhoPct.toFixed(1)}%)` : ""}${l.parcial ? " *" : ""}`;

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
      if (!s) return { id: null, nome: null, tv: null };
      if (s === "USDT") return { id: s, nome: s, tv: "KRAKEN:USDTUSD" };
      const r = porSimbolo.get(s);
      if (r?.semPar) return { id: s, nome: s, tv: null };
      return { id: s, nome: s, tv: `BINANCE:${r?.market ?? `${s}USDT`}` };
    }
    const x = (escolhido ? tradicional.find((c) => c.id === escolhido) : null) ?? tradicional[0];
    if (!x) return { id: null, nome: null, tv: null };
    return { id: x.id, nome: x.asset?.label ?? x.id, tv: x.asset?.tvSymbol ?? null };
  }, [tipo, escolhido, cripto, tradicional, porSimbolo]);

  const escolher = (id: string) => {
    setEscolhido(id);
    graficoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const qtd = (n: number) => (hideBalances ? "••••" : n.toLocaleString(numberFormat, { maximumFractionDigits: 8 }));
  const pctTxt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
  const pctCor = (n: number | null | undefined) => (n == null ? "text-slate-500" : n >= 0 ? "text-emerald-400" : "text-rose-400");
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

          {/* Telemóvel: cartões (a tabela obrigava a deslizar para o lado). */}
          <div className="mt-5 space-y-2 sm:hidden">
            {linhas.map((l) => (
              <button key={l.id} type="button" onClick={() => escolher(l.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${simboloGrafico.id === l.id ? "border-orange-400/50 bg-orange-500/10" : "border-slate-800 bg-slate-950/40"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-white">{l.nome}</span>
                  <span className="tabular-nums text-white">{l.valorTxt}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-slate-400">
                  <span>{l.qtd != null ? `${qtd(l.qtd)} × ${l.preco}` : l.sub}</span>
                  <span>{peso(l.valorEur)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className={pctCor(l.ganhoEur)}>{l.ganhoEur != null ? `${t("mc_pf_gain")}: ${ganhoTxt(l)}` : ""}</span>
                  <span className={pctCor(l.variacao)}>{pctTxt(l.variacao)}</span>
                </div>
              </button>
            ))}
            <div className="flex items-baseline justify-between rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm">
              <span className="font-semibold text-slate-200">{t("mc_pf_total")}</span>
              <span className="tabular-nums font-semibold text-white">{fmtCur(total.valor)}</span>
            </div>
          </div>

          <div className="mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 pr-3">{t("mc_pf_asset")}</th>
                  <th className="pb-2 pr-3">{tipo === "cripto" ? t("mc_pf_source") : t("mc_pf_category")}</th>
                  <th className="pb-2 pr-3 text-right">{t("mc_pf_qty")}</th>
                  <th className="pb-2 pr-3 text-right">{tipo === "cripto" ? t("mc_pf_price") : t("mc_pf_quote")}</th>
                  <th className="pb-2 pr-3 text-right">{t("mc_pf_avg_cost")}</th>
                  <th className="pb-2 pr-3 text-right">{t("mc_pf_value")}</th>
                  <th className="pb-2 pr-3 text-right">{t("mc_pf_gain")}</th>
                  <th className="pb-2 pr-3 text-right">{t("mc_pf_weight")}</th>
                  <th className="pb-2 text-right">{tipo === "cripto" ? "24h" : t("mc_pf_day")}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} onClick={() => escolher(l.id)}
                    className={`cursor-pointer border-t border-slate-800/80 transition ${simboloGrafico.id === l.id ? "bg-orange-500/10" : "hover:bg-slate-800/40"}`}>
                    <td className="py-2 pr-3 font-semibold text-white">{l.nome}</td>
                    <td className="py-2 pr-3 text-xs text-slate-400">{l.sub}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{l.qtd != null ? qtd(l.qtd) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{l.preco}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{l.medio ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white">
                      {l.valorTxt}
                      {l.soInvestido && <span className="ml-1 text-[10px] text-slate-500">{t("mc_pf_invested_tag")}</span>}
                    </td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${pctCor(l.ganhoEur)}`}>{ganhoTxt(l)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">{peso(l.valorEur)}</td>
                    <td className={`py-2 text-right tabular-nums ${pctCor(l.variacao)}`}>{pctTxt(l.variacao)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-600 font-semibold">
                  <td className="py-2 pr-3 text-slate-200" colSpan={5}>{t("mc_pf_total")}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-white">{fmtCur(total.valor)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${pctCor(total.ganho)}`}>{total.ganho != null ? `${formatSigned(total.ganho)}${total.parcial ? " *" : ""}` : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-400">100%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {linhas.some((l) => l.ganhoEur != null) && <p className="mt-3 text-xs text-slate-500">{t("mc_pf_gain_note")}</p>}
          {tipo === "cripto" && vivos.aLer && <p className="mt-3 text-xs text-sky-300/80">{t("mc_pf_loading_live")}</p>}
          {tipo === "cripto" && !vivos.aLer && vivos.falhas > 0 && <p className="mt-3 text-xs text-amber-300/90">{t("mc_pf_live_failed").replace("{n}", String(vivos.falhas))}</p>}
          <p className="mt-4 text-xs text-slate-500">{tipo === "cripto" ? t("mc_pf_note_crypto") : t("mc_pf_note_trad")}</p>
        </>
      )}
    </section>
  );
}
