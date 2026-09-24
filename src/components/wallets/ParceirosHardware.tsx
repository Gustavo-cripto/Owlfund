"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Faixa de parceiros (Ledger & Trezor) no fim de todas as paginas.
//
// As ligacoes vem de variaveis publicas (NEXT_PUBLIC_AFF_LEDGER_URL /
// NEXT_PUBLIC_AFF_TREZOR_URL). Sem elas, vao direitas ao fabricante — e o
// aviso muda: so se diz "ligacao de afiliado" quando o e, para nao prometer
// (nem esconder) uma comissao que nao existe.
const LEDGER = (process.env.NEXT_PUBLIC_AFF_LEDGER_URL ?? "").trim();
const TREZOR = (process.env.NEXT_PUBLIC_AFF_TREZOR_URL ?? "").trim();
const AFILIADO = Boolean(LEDGER || TREZOR);

const MARCAS = [
  { id: "ledger", nome: "Ledger", url: LEDGER || "https://www.ledger.com/", descKey: "hw_ledger_desc" as const, selo: "🔒" },
  { id: "trezor", nome: "Trezor", url: TREZOR || "https://trezor.io/", descKey: "hw_trezor_desc" as const, selo: "🛡️" },
] as const;

export default function ParceirosHardware() {
  const { t } = useLanguage();
  return (
    <aside aria-labelledby="hw-parceiros" className="keep-dark border-t border-slate-900 bg-slate-950/80">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 md:max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">{t("hw_partners_kicker")}</p>
            <p id="hw-parceiros" className="mt-1 text-sm font-bold text-white">{t("hw_partners_title")}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("hw_partners_desc")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:min-w-[440px]">
            {MARCAS.map((m) => (
              <a
                key={m.id}
                href={m.url}
                target="_blank"
                rel={AFILIADO ? "sponsored noopener noreferrer" : "noopener noreferrer"}
                className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 transition hover:border-emerald-400/50 hover:bg-slate-900"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950/80 text-lg ring-1 ring-inset ring-white/10" aria-hidden>{m.selo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{m.nome}</span>
                  <span className="block truncate text-[11px] text-slate-400">{t(m.descKey)}</span>
                </span>
                <span className="shrink-0 rounded-full bg-emerald-400 px-3 py-1.5 text-[11px] font-bold text-slate-950 ring-1 ring-inset ring-white/20 transition group-hover:bg-emerald-300">
                  {t("hw_cta").replace("{marca}", m.nome)}
                </span>
              </a>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">{AFILIADO ? t("hw_aff_note") : t("hw_direct_note")}</p>
      </div>
    </aside>
  );
}
