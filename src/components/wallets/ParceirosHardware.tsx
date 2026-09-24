"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Carteiras fisicas recomendadas, em primeiro lugar na pagina de Carteiras.
//
// As ligacoes vem de variaveis publicas (NEXT_PUBLIC_AFF_LEDGER_URL /
// NEXT_PUBLIC_AFF_TREZOR_URL). Sem elas, vao direitas ao fabricante — e o
// aviso muda: so se diz "ligacao de afiliado" quando o e, para nao prometer
// (nem esconder) uma comissao que nao existe.
const LEDGER = (process.env.NEXT_PUBLIC_AFF_LEDGER_URL ?? "").trim();
const TREZOR = (process.env.NEXT_PUBLIC_AFF_TREZOR_URL ?? "").trim();
const AFILIADO = Boolean(LEDGER || TREZOR);

const MARCAS = [
  { id: "ledger", nome: "Ledger", url: LEDGER || "https://www.ledger.com/", descKey: "hw_ledger_desc" as const, cor: "from-slate-700/60 to-slate-900/80", selo: "🔒" },
  { id: "trezor", nome: "Trezor", url: TREZOR || "https://trezor.io/", descKey: "hw_trezor_desc" as const, cor: "from-emerald-900/40 to-slate-900/80", selo: "🛡️" },
] as const;

export default function ParceirosHardware() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="hw-parceiros" className="rounded-2xl border border-emerald-500/25 bg-slate-900/60 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🔐</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">{t("hw_partners_kicker")}</p>
          <h2 id="hw-parceiros" className="mt-0.5 text-base font-bold text-white">{t("hw_partners_title")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">{t("hw_partners_desc")}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MARCAS.map((m) => (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel={AFILIADO ? "sponsored noopener noreferrer" : "noopener noreferrer"}
            className={`group flex items-center gap-4 rounded-xl border border-slate-700/80 bg-gradient-to-br ${m.cor} p-4 transition hover:border-emerald-400/60 hover:shadow-lg hover:shadow-emerald-500/10`}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950/70 text-2xl ring-1 ring-inset ring-white/10" aria-hidden>{m.selo}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-white">{m.nome}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{t(m.descKey)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/30 transition group-hover:bg-emerald-500/25">
              {t("hw_cta").replace("{marca}", m.nome)}
            </span>
          </a>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">{AFILIADO ? t("hw_aff_note") : t("hw_direct_note")}</p>
    </section>
  );
}
