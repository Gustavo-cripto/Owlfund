"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ErrorNote from "@/components/ErrorNote";
import { SkeletonLines } from "@/components/PageSkeleton";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// Pagina publica "Estado": responde a "e comigo ou e o site?" sem precisar de
// contactar o suporte. Le /api/status (cache de 5 min) e volta a ler sozinha.

type Estado = "ok" | "degradado" | "falha" | "nao_configurado";
type Servico = { id: string; nome: string; funcao: string; estado: Estado; ms: number | null };
type Resposta = { verificadoEm: string; geral: Estado; servicos: Servico[] };

const COR: Record<Estado, string> = {
  ok: "bg-emerald-400", degradado: "bg-amber-400", falha: "bg-rose-400", nao_configurado: "bg-slate-600",
};
const KEY: Record<Estado, TranslationKey> = {
  ok: "st_ok", degradado: "st_degraded", falha: "st_down", nao_configurado: "st_unconfigured",
};
const FUNCAO: Record<string, TranslationKey> = {
  supabase: "st_f_supabase", okx: "st_f_okx", coingecko: "st_f_coingecko", mempool: "st_f_mempool",
  alchemy: "st_f_alchemy", frankfurter: "st_f_frankfurter", twelvedata: "st_f_twelvedata", telegram: "st_f_telegram",
};

export default function Status() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as Resposta);
      setErro(false);
    } catch { setErro(true); }
  };
  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const locale = ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[lang] ?? "pt-PT";

  return (
    <AppShell>
      <main className="stagger-in mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-24 pt-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">ChainFolioAI</p>
          <h1 className="mt-2 text-3xl font-bold text-white">{t("st_title")}</h1>
          <p className="mt-2 text-sm text-slate-400">{t("st_sub")}</p>
        </div>

        {erro && <ErrorNote onRetry={carregar}>{t("st_error")}</ErrorNote>}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          {!data ? (
            <SkeletonLines n={6} />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3" role="status">
                <p className="flex items-center gap-2 text-base font-semibold text-white">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${COR[data.geral]}`} aria-hidden="true" />
                  {t(data.geral === "ok" ? "st_all_ok" : data.geral === "degradado" ? "st_some_slow" : "st_some_down")}
                </p>
                <p className="text-xs text-slate-500">
                  {t("st_checked")} {new Date(data.verificadoEm).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <ul className="divide-y divide-slate-800">
                {data.servicos.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COR[s.estado]}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{s.nome}</p>
                        <p className="text-xs text-slate-400">{t(FUNCAO[s.id] ?? "st_f_supabase")}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-slate-200">{t(KEY[s.estado])}</p>
                      {s.ms != null && <p className="text-[11px] tabular-nums text-slate-500">{s.ms} ms</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p className="text-xs leading-relaxed text-slate-500">{t("st_note")}</p>
      </main>
    </AppShell>
  );
}
