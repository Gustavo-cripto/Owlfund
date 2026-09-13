"use client";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { btnPrimary } from "@/lib/ui/buttons";
import { useEffect, useRef, useState } from "react";

// Página de retorno após o checkout cripto (Helio). Faz polling ao estado da
// subscrição até o webhook creditar o acesso. Configurar a "redirect URL" do
// Pay Link do Helio para {site}/crypto/confirm.
//
// Estados: "waiting" (a confirmar on-chain) → "confirmed" (acesso ativo) ou
// "timeout" (ainda a processar — o webhook pode demorar; o acesso ativa sozinho).

type Status = "waiting" | "confirmed" | "timeout";

const POLL_MS = 4000;
const MAX_MS = 150000; // ~2,5 min de polling antes de mostrar "ainda a processar"

export default function CryptoConfirmPage() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>("waiting");
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await fetch("/api/crypto/subscription", { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as { crypto: { currentPeriodEnd: string | null; lastPaymentAt?: string | null } | null };
          const end = j.crypto?.currentPeriodEnd ? new Date(j.crypto.currentPeriodEnd) : null;
          // Só conta como confirmado se o ÚLTIMO pagamento for recente (uma
          // renovação de quem já tinha subscrição não deve "confirmar" no 1.º poll).
          const lastPay = j.crypto?.lastPaymentAt ? new Date(j.crypto.lastPaymentAt).getTime() : 0;
          const recent = lastPay >= startedAt.current - 10 * 60_000;
          if (end && end.getTime() > Date.now() && recent) {
            setStatus("confirmed");
            return; // pára o polling
          }
        }
      } catch { /* ignora e volta a tentar */ }

      if (Date.now() - startedAt.current > MAX_MS) {
        setStatus("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  return (
    <AppShell>
      <div className="relative min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">

          {status === "waiting" && (
            <>
              <div className="mb-6 h-14 w-14 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" aria-hidden />
              <h1 className="text-2xl font-bold text-white">{t("cc_waiting_title")}</h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{t("cc_waiting_desc")}</p>
              <a href="/account" className="mt-6 text-xs text-slate-500 underline decoration-dotted hover:text-white">{t("nav_account")} →</a>
            </>
          )}

          {status === "confirmed" && (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-3xl" aria-hidden>✓</div>
              <h1 className="text-2xl font-bold text-emerald-400">{t("cc_confirmed_title")}</h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{t("cc_confirmed_desc")}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href="/dashboard" className={`${btnPrimary} px-6 py-2.5 text-sm`}>{t("cc_go_dashboard")}</a>
                <a href="/account" className="rounded-full border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition">{t("cc_go_account")}</a>
              </div>
            </>
          )}

          {status === "timeout" && (
            <>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-3xl" aria-hidden>⏳</div>
              <h1 className="text-2xl font-bold text-amber-300">{t("cc_timeout_title")}</h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{t("cc_timeout_desc")}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href="/account" className={`${btnPrimary} px-6 py-2.5 text-sm`}>{t("cc_go_account")}</a>
              </div>
            </>
          )}

        </main>
      </div>
    </AppShell>
  );
}
