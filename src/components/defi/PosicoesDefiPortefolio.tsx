"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PosicoesDefi from "@/components/defi/PosicoesDefi";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { loadWalletSnapshot, type WalletSnapshot } from "@/lib/wallets/storage";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

// Secção do Portefólio: as posições DeFi de todas as carteiras da conta, como
// as Carteiras as leram da última vez (não volta a pedir tudo à blockchain).

const curto = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export default function PosicoesDefiPortefolio() {
  const { t, lang } = useLanguage();
  const { formatUsd } = useCurrencyFormat();
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  useEffect(() => { setSnap(loadWalletSnapshot()); }, []);

  const posicoes = useMemo(() => {
    if (!snap?.defiPosicoes) return [] as (PosicaoDefi & { carteira?: string })[];
    // Nome da carteira: a etiqueta que a pessoa lhe deu, ou o endereço encurtado.
    const etiquetas = new Map<string, string>();
    for (const k of ["eth", "sol", "btc", "ada", "other"] as const) {
      for (const e of snap[k] ?? []) if (e.address) etiquetas.set(e.address.toLowerCase(), e.label || curto(e.address));
    }
    return Object.entries(snap.defiPosicoes).flatMap(([chave, lista]) => {
      const endereco = chave.slice(0, chave.indexOf(":"));
      const carteira = etiquetas.get(endereco.toLowerCase()) ?? curto(endereco);
      return (lista ?? []).map((p) => ({ ...p, carteira }));
    });
  }, [snap]);

  const abertas = posicoes.filter((p) => p.estado !== "fechada");
  const resumo = {
    valor: abertas.reduce((s, p) => s + (p.usd || 0), 0),
    dentro: abertas.filter((p) => p.noIntervalo === true).length,
    fora: abertas.filter((p) => p.noIntervalo === false).length,
    emprestimos: abertas.filter((p) => p.tipo === "emprestimo").length,
    fechadas: posicoes.length - abertas.length,
  };
  const quando = snap?.defiPosicoesEm
    ? new Date(snap.defiPosicoesEm).toLocaleString(lang === "en" ? "en-GB" : lang === "pt" ? "pt-PT" : lang, { dateStyle: "medium", timeStyle: "short" })
    : null;

  if (!snap) return null;
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("df_portfolio_title")}</h2>
          {quando && <p className="text-xs text-slate-500">{t("df_portfolio_updated").replace("{d}", quando)}</p>}
        </div>
        <Link href="/wallets" className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 hover:text-white">{t("nav_wallets")} →</Link>
      </div>
      {posicoes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{t("df_portfolio_empty")}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Numero rotulo={t("df_sum_value")} valor={formatUsd(resumo.valor)} cor="text-emerald-300" />
            <Numero rotulo={t("df_sum_open")} valor={String(abertas.length)} />
            <Numero rotulo={t("df_in_range")} valor={String(resumo.dentro)} cor="text-emerald-300" />
            <Numero rotulo={t("df_out_range")} valor={String(resumo.fora)} cor={resumo.fora ? "text-amber-300" : undefined} />
            <Numero rotulo={t("df_sum_closed")} valor={String(resumo.fechadas)} cor="text-slate-400" />
          </div>
          <div className="mt-4">
            <PosicoesDefi posicoes={posicoes} abertaAoInicio comCarteira />
          </div>
        </>
      )}
    </section>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-center">
      <p className={`text-lg font-bold tabular-nums ${cor ?? "text-white"}`}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{rotulo}</p>
    </div>
  );
}
