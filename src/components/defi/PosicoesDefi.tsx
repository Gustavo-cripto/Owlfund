"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

// Lista das posições DeFi: abertas com o detalhe (par, intervalo, quantidades,
// taxas por reclamar, empréstimos) e fechadas recolhidas por baixo.
// Usada por baixo de cada carteira (Carteiras) e no Portefólio.

const ESTAVEIS = new Set(["USDC", "USDT", "DAI", "USDC.E", "USDBC", "USDS", "USDE", "FDUSD", "PYUSD", "LUSD", "GHO", "FRAX", "CRVUSD", "USD₮0", "USDT0", "EURC"]);
const REDE_UNISWAP: Record<string, string> = { eth: "ethereum", arbitrum: "arbitrum", base: "base", optimism: "optimism", polygon: "polygon", bsc: "bnb" };
const REDE_NOME: Record<string, string> = { eth: "Ethereum", arbitrum: "Arbitrum", base: "Base", optimism: "Optimism", polygon: "Polygon", bsc: "BNB Chain", sol: "Solana", solana: "Solana", avalanche: "Avalanche" };

type Props = {
  posicoes: readonly (PosicaoDefi & { carteira?: string })[];
  /** Começa aberta (Portefólio) ou fechada (por baixo de uma carteira). */
  abertaAoInicio?: boolean;
  /** Mostra a carteira de cada posição (no Portefólio, que junta todas). */
  comCarteira?: boolean;
};

export default function PosicoesDefi({ posicoes, abertaAoInicio = false, comCarteira = false }: Props) {
  const { t } = useLanguage();
  const { formatUsd, hideBalances, numberFormat } = useCurrencyFormat();
  const [aberta, setAberta] = useState(abertaAoInicio);
  const abertas = posicoes.filter((p) => p.estado !== "fechada").sort((a, b) => b.usd - a.usd);
  const fechadas = posicoes.filter((p) => p.estado === "fechada");
  if (!posicoes.length) return null;

  const n = (x: number) => {
    if (hideBalances) return "••••";
    const a = Math.abs(x);
    return x.toLocaleString(numberFormat, { maximumFractionDigits: a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.0001 ? 6 : 10, maximumSignificantDigits: a > 0 && a < 1 ? 6 : undefined });
  };
  const preco = (x: number) => x.toLocaleString(numberFormat, { maximumSignificantDigits: 6 });

  return (
    <div className="mt-1.5 rounded-lg border border-slate-800/80 bg-slate-950/40">
      <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:text-white">
        <span>
          <b className="font-semibold">{t("df_title")}</b> · {t("df_open_n").replace("{n}", String(abertas.length))}
          {fechadas.length > 0 && <> · <span className="text-slate-500">{t("df_closed_n").replace("{n}", String(fechadas.length))}</span></>}
        </span>
        <span aria-hidden className={`transition-transform ${aberta ? "rotate-180" : ""}`}>▾</span>
      </button>
      {aberta && (
        <div className="space-y-2 px-2.5 pb-2.5">
          {abertas.map((p, i) => {
            const par = p.par ?? [];
            // Intervalo mostrado como preço do ativo volátil na estável (mais legível).
            const inverter = par.length === 2 && ESTAVEIS.has(par[0].toUpperCase()) && !ESTAVEIS.has(par[1].toUpperCase());
            const base = inverter ? par[1] : par[0];
            const cot = inverter ? par[0] : par[1];
            const iv = p.intervalo && p.intervalo.min > 0 && p.intervalo.max > 0
              ? inverter
                ? { min: 1 / p.intervalo.max, max: 1 / p.intervalo.min, atual: p.intervalo.atual ? 1 / p.intervalo.atual : null }
                : p.intervalo
              : null;
            const muitoLargo = iv && (iv.max / iv.min > 1e6);
            const rede = p.rede ? REDE_NOME[p.rede] ?? p.rede : null;
            const uni = p.tokenId && p.protocolo?.startsWith("Uniswap V") && p.rede && REDE_UNISWAP[p.rede]
              ? `https://app.uniswap.org/positions/${p.protocolo.endsWith("V4") ? "v4" : "v3"}/${REDE_UNISWAP[p.rede]}/${p.tokenId}` : null;
            return (
              <div key={`${p.name}-${p.tokenId ?? i}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-white">{par.length ? par.join(" / ") : p.protocolo ?? p.name}</span>
                    {p.taxaPool != null && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{preco(p.taxaPool)}%</span>}
                    {p.noIntervalo === true && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">{t("df_in_range")}</span>}
                    {p.noIntervalo === false && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300" title={t("df_out_range_hint")}>{t("df_out_range")}</span>}
                    {p.tipo === "emprestimo" && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">{t("df_lending")}</span>}
                    {p.tipo === "staking" && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">Staking</span>}
                  </div>
                  <span className="tabular-nums font-semibold text-emerald-300">
                    {formatUsd(p.usd)}{p.valorEstimado && <span className="ml-1 text-[10px] font-normal text-slate-500" title={t("df_estimated_hint")}>≈</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-500">
                  {p.par?.length && p.protocolo ? p.protocolo : null}{rede ? `${p.par?.length && p.protocolo ? " · " : ""}${rede}` : null}
                  {comCarteira && p.carteira ? ` · ${p.carteira}` : null}
                  {uni && <> · <a href={uni} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300">Uniswap ↗</a></>}
                </p>
                {p.quantidades && p.quantidades.length > 0 && (
                  <p className="mt-1 text-slate-300">{p.quantidades.map((q) => `${n(q.qtd)} ${q.simbolo}`).join(" + ")}</p>
                )}
                {iv && (
                  <p className="mt-0.5 text-slate-400">
                    {t("df_range")}: {muitoLargo ? t("df_full_range") : `${preco(iv.min)} – ${preco(iv.max)}`} {cot}/{base}
                    {iv.atual != null && <> · {t("df_now")} {preco(iv.atual)}</>}
                  </p>
                )}
                {p.taxasPorReclamar && (p.taxasUsd ?? 0) > 0 && (
                  <p className="mt-0.5 text-slate-400">{t("df_fees")}: {p.taxasPorReclamar.filter((x) => x.qtd > 0).map((x) => `${n(x.qtd)} ${x.simbolo}`).join(" + ")} ({formatUsd(p.taxasUsd ?? 0)})</p>
                )}
                {p.tipo === "emprestimo" && (p.depositadoUsd != null || p.emprestadoUsd != null) && (
                  <p className="mt-0.5 text-slate-400">
                    {t("df_supplied")}: {formatUsd(p.depositadoUsd ?? 0)} · {t("df_borrowed")}: {formatUsd(p.emprestadoUsd ?? 0)}
                    {p.fatorSaude != null && (
                      <> · {t("df_health")}: <span className={p.fatorSaude < 1.2 ? "text-rose-400" : p.fatorSaude < 1.5 ? "text-amber-300" : "text-emerald-300"}>{preco(p.fatorSaude)}</span></>
                    )}
                  </p>
                )}
              </div>
            );
          })}
          {abertas.length === 0 && <p className="text-[11px] text-slate-500">{t("df_none_open")}</p>}
          {fechadas.length > 0 && (
            <details className="rounded-lg border border-slate-800/70 bg-slate-900/30 px-2.5 py-1.5 text-[11px]">
              <summary className="cursor-pointer text-slate-400">{t("df_closed_title").replace("{n}", String(fechadas.length))}</summary>
              <ul className="mt-1.5 space-y-1">
                {fechadas.map((p, i) => {
                  const uni = p.tokenId && p.protocolo?.startsWith("Uniswap V") && p.rede && REDE_UNISWAP[p.rede]
                    ? `https://app.uniswap.org/positions/${p.protocolo.endsWith("V4") ? "v4" : "v3"}/${REDE_UNISWAP[p.rede]}/${p.tokenId}` : null;
                  return (
                    <li key={`${p.name}-${p.tokenId ?? i}`} className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                      <span>
                        <span className="text-slate-300">{p.par?.join(" / ") ?? p.name}</span>
                        {p.taxaPool != null && <span className="ml-1 text-slate-500">{preco(p.taxaPool)}%</span>}
                        <span className="ml-1 text-slate-500">· {p.protocolo}{p.rede ? ` · ${REDE_NOME[p.rede] ?? p.rede}` : ""}{p.tokenId ? ` · #${p.tokenId}` : ""}</span>
                        {comCarteira && p.carteira ? <span className="ml-1 text-slate-600">· {p.carteira}</span> : null}
                      </span>
                      {uni && <a href={uni} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300">Uniswap ↗</a>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[10px] text-slate-500">{t("df_closed_note")}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
