"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { getActiveAccountId } from "@/lib/portfolios/accounts";
import { ganhoAtivo, lerAtivosConta, type AtivoCripto } from "@/lib/portfolios/ativosConta";
import { zonaRsi, type Indicadores } from "@/lib/market/indicadores";

// Por baixo do gráfico do Mercado: ficha do ativo, leitura técnica, resumo dos
// derivados e a posição da pessoa. Tudo descritivo: nada aqui diz para comprar
// ou vender (regra do site, ver src/lib/ai/disclaimer.ts).

type Linha = {
  symbol: string; name: string; priceUsd: number; marketCapUsd: number | null; volume24hUsd: number;
  change7d: number | null; change30d: number | null; rank?: number | null; ath?: number | null; athDate?: string | null;
  circulating?: number | null; maxSupply?: number | null;
};
type Derivados = {
  score: number;
  /** Já em % (a API multiplica por 100). */
  funding: { t: number; v: number }[];
  longShort: { t: number; buy: number; sell: number }[];
  oi: { t: number; v: number }[];
} | null;

type Props = {
  linha: Linha | null;
  rows: readonly { symbol: string; priceUsd: number }[];
  derivados: Derivados;
  derivadosACarregar: boolean;
  verDerivados: () => void;
};

const cacheInd = new Map<string, { at: number; ind: Indicadores | null }>();

export default function PainelAtivo({ linha, rows, derivados, derivadosACarregar, verDerivados }: Props) {
  const { t, lang } = useLanguage();
  const { format: fmtCur, formatSigned, formatMarketUsd: fmtMkt, usdToEur, hideBalances, numberFormat } = useCurrencyFormat();
  const simbolo = linha?.symbol ?? "BTC";
  const [ind, setInd] = useState<{ simbolo: string; ind: Indicadores | null; aLer: boolean; erro: boolean }>({ simbolo: "", ind: null, aLer: false, erro: false });

  useEffect(() => {
    const c = cacheInd.get(simbolo);
    if (c && Date.now() - c.at < 15 * 60_000) { setInd({ simbolo, ind: c.ind, aLer: false, erro: false }); return; }
    let vivo = true;
    setInd({ simbolo, ind: null, aLer: true, erro: false });
    fetch(`/api/indicadores?symbol=${encodeURIComponent(simbolo)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { indicadores: Indicadores | null }) => {
        cacheInd.set(simbolo, { at: Date.now(), ind: d.indicadores });
        if (vivo) setInd({ simbolo, ind: d.indicadores, aLer: false, erro: false });
      })
      .catch(() => { if (vivo) setInd({ simbolo, ind: null, aLer: false, erro: true }); });
    return () => { vivo = false; };
  }, [simbolo]);

  // A posição da conta ativa (só os ativos guardados; as leituras em direto estão na aba "O meu portefólio").
  const [meus, setMeus] = useState<AtivoCripto[]>([]);
  useEffect(() => { try { setMeus(lerAtivosConta(getActiveAccountId()).cripto); } catch { setMeus([]); } }, []);
  const posicao = useMemo(() => {
    const a = meus.find((x) => x.symbol === simbolo);
    if (!a || !linha || !(a.quantidade > 0)) return null;
    const precoEur = linha.priceUsd * usdToEur;
    const precos = new Map(rows.map((r) => [r.symbol, r.priceUsd]));
    const totalEur = meus.reduce((s, x) => s + (x.quantidade > 0 && precos.has(x.symbol) ? x.quantidade * (precos.get(x.symbol) as number) * usdToEur : x.investidoSemQuantidadeEur), 0);
    const valorEur = a.quantidade * precoEur;
    return { a, valorEur, peso: totalEur > 0 ? (valorEur / totalEur) * 100 : null, g: ganhoAtivo(a, precoEur) };
  }, [meus, simbolo, linha, rows, usdToEur]);

  const n = (x: number, d = 2) => x.toLocaleString(numberFormat, { maximumFractionDigits: d });
  const pct = (x: number | null | undefined, sinal = true) => (x == null || !Number.isFinite(x) ? "—" : `${sinal && x >= 0 ? "+" : ""}${n(x, 1)}%`);
  const cor = (x: number | null | undefined) => (x == null ? "text-slate-300" : x >= 0 ? "text-emerald-400" : "text-rose-400");
  const precoUsd = (x: number | null) => (x == null ? "—" : fmtMkt(x, { decimals: x < 1 ? 6 : 2 }));
  const compacto = (x: number) => (Math.abs(x) >= 1e9 ? `${n(x / 1e9)} ${t("mc_units_bn")}` : Math.abs(x) >= 1e6 ? `${n(x / 1e6)} ${t("mc_units_mn")}` : n(x, 0));
  const dataCurta = (iso: string) => { try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : `${lang}-${lang === "pt" ? "PT" : lang.toUpperCase()}`, { year: "numeric", month: "short", day: "numeric" }); } catch { return iso.slice(0, 10); } };

  if (!linha) return null;
  const athDist = linha.ath && linha.ath > 0 ? (linha.priceUsd / linha.ath - 1) * 100 : null;
  const i = ind.simbolo === simbolo ? ind.ind : null;
  const zona = zonaRsi(i?.rsi14 ?? null);
  const fundingUlt = derivados?.funding?.length ? derivados.funding[derivados.funding.length - 1].v : null;
  const ls = derivados?.longShort?.length ? derivados.longShort[derivados.longShort.length - 1] : null;
  const oi = derivados?.oi ?? [];
  const oiVar = oi.length >= 2 && oi[0].v > 0 ? (oi[oi.length - 1].v / oi[0].v - 1) * 100 : null;

  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Cartao titulo={t("mc_pa_facts")}>
        <Linha2 k={t("mc_pa_rank")} v={linha.rank ? `#${linha.rank}` : "—"} />
        <Linha2 k={t("mc_pa_cap")} v={linha.marketCapUsd ? fmtMkt(linha.marketCapUsd, { compact: true }) : "—"} />
        <Linha2 k={t("mc_pa_volume")} v={fmtMkt(linha.volume24hUsd, { compact: true })} />
        <Linha2 k={t("mc_pa_supply")} v={linha.circulating ? `${compacto(linha.circulating)}${linha.maxSupply ? ` / ${compacto(linha.maxSupply)} (${n((linha.circulating / linha.maxSupply) * 100, 0)}%)` : ""}` : "—"} />
        <Linha2 k={t("mc_pa_ath")} v={linha.ath ? `${precoUsd(linha.ath)}${linha.athDate ? ` · ${dataCurta(linha.athDate)}` : ""}` : "—"} />
        <Linha2 k={t("mc_pa_from_ath")} v={pct(athDist)} cor={cor(athDist)} />
        <Linha2 k="7d · 30d" v={<><span className={cor(linha.change7d)}>{pct(linha.change7d)}</span> · <span className={cor(linha.change30d)}>{pct(linha.change30d)}</span></>} />
      </Cartao>

      <Cartao titulo={t("mc_pa_technical")} rodape={i ? t("mc_pa_tech_note").replace("{par}", `${simbolo}-USDT`).replace("{n}", String(i.velas)) : undefined}>
        {ind.aLer && <p className="text-xs text-slate-500">{t("mc_pa_loading")}</p>}
        {!ind.aLer && !i && <p className="text-xs text-slate-500">{ind.erro ? t("mc_pa_tech_fail") : t("mc_pa_tech_none").replace("{s}", simbolo)}</p>}
        {i && (
          <>
            <Linha2 k="RSI 14" v={i.rsi14 != null ? `${n(i.rsi14, 0)} · ${t(zona === "sobrecompra" ? "mc_pa_rsi_high" : zona === "sobrevenda" ? "mc_pa_rsi_low" : "mc_pa_rsi_mid")}` : "—"} />
            <Linha2 k={t("mc_pa_sma50")} v={i.sma50 != null ? `${precoUsd(i.sma50)} · ${pct(i.vsSma50)}` : "—"} cor={cor(i.vsSma50)} />
            <Linha2 k={t("mc_pa_sma200")} v={i.sma200 != null ? `${precoUsd(i.sma200)} · ${pct(i.vsSma200)}` : t("mc_pa_short_history")} cor={i.sma200 != null ? cor(i.vsSma200) : undefined} />
            {i.cruzamento && (
              <p className="text-xs text-slate-300">{t(i.cruzamento.tipo === "dourado" ? "mc_pa_cross_golden" : "mc_pa_cross_death").replace("{d}", String(i.cruzamento.haDias))}</p>
            )}
            <Linha2 k={t("mc_pa_vol30")} v={i.volatilidade30 != null ? `${n(i.volatilidade30, 0)}%` : "—"} />
            <Linha2 k={t("mc_pa_range30")} v={i.min30 != null && i.max30 != null ? `${precoUsd(i.min30)} – ${precoUsd(i.max30)}` : "—"} />
            <Linha2 k={t("mc_pa_range90")} v={i.min90 != null && i.max90 != null ? `${precoUsd(i.min90)} – ${precoUsd(i.max90)}` : "—"} />
            <Linha2 k="90d" v={pct(i.var90)} cor={cor(i.var90)} />
          </>
        )}
      </Cartao>

      <Cartao titulo={t("mc_pa_derivs")}>
        {derivadosACarregar && <p className="text-xs text-slate-500">{t("mc_pa_loading")}</p>}
        {!derivadosACarregar && !derivados && <p className="text-xs text-slate-500">{t("mc_pa_derivs_none").replace("{s}", simbolo)}</p>}
        {derivados && (
          <>
            <Linha2 k={t("mc_sentiment_score")} v={`${derivados.score}/100 · ${derivados.score >= 55 ? t("mc_score_bull") : derivados.score <= 45 ? t("mc_score_bear") : t("mc_score_neutral")}`}
              cor={derivados.score >= 55 ? "text-emerald-400" : derivados.score <= 45 ? "text-rose-400" : "text-slate-200"} />
            <Linha2 k="Funding" v={fundingUlt != null ? `${fundingUlt >= 0 ? "+" : ""}${fundingUlt.toFixed(4)}%` : "—"} cor={cor(fundingUlt)} />
            <Linha2 k="Long / Short" v={ls && ls.sell > 0 ? n(ls.buy / ls.sell, 2) : "—"} />
            <Linha2 k={t("mc_pa_oi_change")} v={pct(oiVar)} cor={cor(oiVar)} />
          </>
        )}
        <button type="button" onClick={verDerivados} className="mt-2 text-left text-xs font-semibold text-orange-300 hover:text-orange-200">{t("mc_pa_derivs_full")} →</button>
      </Cartao>

      <Cartao titulo={t("mc_pa_position")}>
        {posicao ? (
          <>
            <Linha2 k={t("mc_pf_qty")} v={hideBalances ? "••••" : n(posicao.a.quantidade, 8)} />
            <Linha2 k={t("mc_pf_value")} v={fmtCur(posicao.valorEur)} />
            <Linha2 k={t("mc_pf_avg_cost")} v={posicao.g ? fmtCur(posicao.g.medio, { decimals: posicao.g.medio < 1 ? 6 : 2 }) : "—"} />
            <Linha2 k={t("mc_pf_gain")} v={posicao.g ? `${formatSigned(posicao.g.ganhoEur)}${hideBalances ? "" : ` (${pct(posicao.g.pct)})`}${posicao.g.parcial ? " *" : ""}` : "—"} cor={posicao.g ? cor(posicao.g.ganhoEur) : undefined} />
            <Linha2 k={t("mc_pa_weight")} v={posicao.peso != null ? `${n(posicao.peso, 1)}%` : "—"} />
          </>
        ) : (
          <p className="text-xs text-slate-500">{t("mc_pa_not_held").replace("{s}", simbolo)}</p>
        )}
      </Cartao>
    </div>
  );
}

function Cartao({ titulo, rodape, children }: { titulo: string; rodape?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{titulo}</p>
      {children}
      {rodape && <p className="mt-auto pt-2 text-[10px] leading-snug text-slate-500">{rodape}</p>}
    </div>
  );
}

function Linha2({ k, v, cor }: { k: string; v: ReactNode; cor?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className={`text-right tabular-nums ${cor ?? "text-slate-200"}`}>{v}</span>
    </div>
  );
}
