"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { pageUrl } from "@/lib/i18n/routes";
import { btnPrimary } from "@/lib/ui/buttons";

// Bloco "Experimenta sem conta" da landing. Fala com /api/preview (publica,
// com limite por IP e cache por endereco). Nao guarda o endereco em lado
// nenhum — nem aqui, nem no servidor.

type Linha = { symbol: string; name: string; chain: string; balance: number; usdValue: number; logo?: string };
type Resposta = { kind: "evm" | "sol" | "btc"; networks: string[]; totalUsd: number; tokens: Linha[]; others: number; nftCount: number | null };

const REDE: Record<string, string> = {
  eth: "Ethereum", base: "Base", arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon", sol: "Solana", btc: "Bitcoin",
};
// Endereco publico muito conhecido (vitalik.eth), so para quem nao tem um a mao.
const EXEMPLO = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

export default function ExperimentarSemConta() {
  const { t, lang } = useLanguage();
  const { formatUsd } = useCurrencyFormat();
  const [address, setAddress] = useState("");
  const [estado, setEstado] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);

  const consultar = async (valor: string) => {
    const a = valor.trim();
    if (!a) return;
    setEstado("loading"); setErro(""); setDados(null);
    try {
      const r = await fetch(`/api/preview?address=${encodeURIComponent(a)}`);
      const j = (await r.json().catch(() => ({}))) as Resposta & { error?: string };
      if (!r.ok) {
        setErro(r.status === 429 ? t("lp_try_err_rate") : j.error === "invalid" ? t("lp_try_err_invalid") : t("lp_try_err_generic"));
        setEstado("error");
        return;
      }
      setDados(j); setEstado("ok");
    } catch {
      setErro(t("lp_try_err_generic")); setEstado("error");
    }
  };

  const fmtQtd = (n: number) => n.toLocaleString(lang === "en" ? "en-GB" : `${lang}-${lang.toUpperCase()}`, { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });

  return (
    <section id="experimentar" className="mx-auto w-full max-w-4xl scroll-mt-24 px-6 pt-16">
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/[0.07] to-slate-900/60 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/90">{t("lp_try_kicker")}</p>
        <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">{t("lp_try_title")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{t("lp_try_desc")}</p>

        <form
          className="mt-5 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); void consultar(address); }}
        >
          <label htmlFor="try-address" className="sr-only">{t("lp_try_ph")}</label>
          <input
            id="try-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("lp_try_ph")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:font-sans placeholder:text-slate-500 focus:border-orange-400"
          />
          <button type="submit" disabled={estado === "loading" || !address.trim()} className={`${btnPrimary} px-6 py-3 text-sm`}>
            {estado === "loading" ? t("lp_try_loading") : t("lp_try_btn")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setAddress(EXEMPLO); void consultar(EXEMPLO); }}
          className="mt-2 text-xs text-slate-400 underline decoration-dotted underline-offset-2 transition hover:text-orange-300"
        >
          {t("lp_try_example")}
        </button>

        {estado === "error" && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{erro}</p>
        )}

        {estado === "ok" && dados && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("lp_try_total")}</p>
                <p className="metric-value mt-1 text-3xl font-black text-white">{formatUsd(dados.totalUsd)}</p>
              </div>
              <p className="text-xs text-slate-400">
                {t("lp_try_networks")}: {dados.networks.map((n) => REDE[n] ?? n).join(" · ")}
                {dados.nftCount != null && <> · {t("lp_try_nfts")}: <span className="font-semibold text-slate-200">{dados.nftCount >= 10_000 ? `${(10_000).toLocaleString(lang === "en" ? "en-GB" : "pt-PT")}+` : dados.nftCount}</span></>}
              </p>
            </div>

            {dados.tokens.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">{t("lp_try_none")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/70">
                {dados.tokens.map((l, i) => (
                  <li key={`${l.chain}-${l.symbol}-${i}`} className="flex items-center gap-3 py-2.5">
                    {l.logo
                      ? <img src={l.logo} alt="" className="h-7 w-7 shrink-0 rounded-full bg-slate-800 object-cover" loading="lazy" />
                      : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-300">{l.symbol.slice(0, 3)}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">{l.symbol}</span>
                      <span className="block truncate text-[11px] text-slate-400">{fmtQtd(l.balance)} · {REDE[l.chain] ?? l.chain}</span>
                    </span>
                    <span className="text-sm font-semibold text-slate-100">{formatUsd(l.usdValue)}</span>
                  </li>
                ))}
              </ul>
            )}
            {dados.others > 0 && <p className="mt-2 text-xs text-slate-400">{t("lp_try_tokens_more").replace("{n}", String(dados.others))}</p>}

            <a href={`${pageUrl("login", lang)}?mode=signup&next=%2Fwallets`} className={`${btnPrimary} mt-5 w-full px-6 py-3 text-sm sm:w-auto`}>
              {t("lp_try_cta")}
            </a>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{t("lp_try_note")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
