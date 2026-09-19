"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { pageUrl } from "@/lib/i18n/routes";
import type { TranslationKey } from "@/lib/i18n/translations";
import { comSupabase } from "@/lib/supabase/lazy";

const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
const ERR_KEY: Record<string, TranslationKey> = { rate_limited: "beta_err_rate", bad_email: "beta_bad_email", send_failed: "beta_err", bad_request: "beta_err" };
const LOCALE: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
const CUTOFF_RAW = process.env.NEXT_PUBLIC_BETA_CUTOFF ?? "2026-11-05T23:59:59Z";

/**
 * Indicador de etapa: a inscricao sao dois atos e isso tem de se ver.
 *
 * Os dois passos sao independentes — ha quem chegue ja com conta feita (vem do
 * plano gratuito) e quem se inscreva primeiro. Por isso cada um tem o seu
 * estado, em vez de um numero de passo linear que mentiria a metade das pessoas.
 */
function Steps({ inscrito, temConta, t }: { inscrito: boolean; temConta: boolean; t: (k: TranslationKey) => string }) {
  const items: Array<{ n: number; label: TranslationKey; feito: boolean }> = [
    { n: 1, label: "beta_step1", feito: inscrito },
    { n: 2, label: "beta_step2", feito: temConta },
  ];
  const proximo = items.find((i) => !i.feito)?.n;
  return (
    <ol className="mt-6 flex items-center gap-3" aria-label={t("beta_steps_label")}>
      {items.map((it) => {
        const atual = proximo === it.n;
        return (
          <li key={it.n} className="flex flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              it.feito ? "bg-emerald-500 text-slate-950" : atual ? "bg-orange-400 text-slate-950" : "bg-slate-800 text-slate-500"
            }`}>{it.feito ? "✓" : it.n}</span>
            <span className={`text-[11px] leading-tight ${it.feito ? "text-emerald-300/80" : atual ? "text-white" : "text-slate-500"}`}>{t(it.label)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TelegramCard({ t }: { t: (k: TranslationKey) => string }) {
  return (
    <a href="https://t.me/ChainFolioAiBetaBot" target="_blank" rel="noopener noreferrer"
      className="mt-4 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3 transition hover:border-sky-400/50">
      <span className="text-xl" aria-hidden>💬</span>
      <span className="text-sm text-slate-300">
        <span className="font-semibold text-sky-300">{t("beta_bot_title")}</span>
        <br />
        {t("beta_bot_desc")} <span className="font-mono text-sky-300">@ChainFolioAiBetaBot</span>
      </span>
    </a>
  );
}

export default function BetaSignup() {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot (invisível)
  const [already, setAlready] = useState(false);

  // Vindo do registo (/login?next=/beta) com o email já criado.
  useEffect(() => {
    try { const e = new URLSearchParams(window.location.search).get("email"); if (e) setEmail(e); } catch { /* ignore */ }
  }, []);

  // Ha conta? O passo 2 e criar conta, e quem chega ja com sessao (ou volta do
  // registo por email de confirmacao) nao pode ver "cria a conta" outra vez —
  // era o beco sem saida: o tester voltava a /beta, via o mesmo formulario, e
  // concluia que nada tinha resultado.
  const [temConta, setTemConta] = useState<boolean | null>(null);
  useEffect(() => comSupabase((c) => {
    let vivo = true;
    void c.auth.getUser().then((r: { data: { user: { email?: string } | null } }) => {
      if (!vivo) return;
      const u = r.data.user;
      setTemConta(!!u);
      if (u?.email) setEmail((atual) => atual || u.email!);
    }).catch(() => { if (vivo) setTemConta(false); });
    return () => { vivo = false; };
  }), []);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [err, setErr] = useState("");

  // Beta encerrado a novos testers a partir da data de corte (env).
  const betaClosed = (() => {
    const raw = process.env.NEXT_PUBLIC_BETA_CUTOFF ?? "2026-11-05T23:59:59Z";
    if (!raw) return false;
    const d = new Date(raw);
    return !Number.isNaN(d.getTime()) && Date.now() > d.getTime();
  })();
  const cutoffStr = (() => {
    const d = new Date(CUTOFF_RAW);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(LOCALE[lang] ?? "pt-PT", { day: "numeric", month: "long" });
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr(t("beta_bad_email"));
      setState("error");
      return;
    }
    setState("sending");
    setErr("");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          note: note.trim(),
          website,
          lang,
          // Origem do link (?src=twitter etc.) para atribuição por rede.
          src: (() => {
            try {
              return new URLSearchParams(window.location.search).get("src") ?? "";
            } catch { return ""; }
          })(),
        }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string; already?: boolean } | null;
      if (!res.ok) {
        const code = j?.error ?? "";
        throw new Error(code === "beta_closed" ? t("beta_closed_body") : t(ERR_KEY[code] ?? "beta_err"));
      }
      setAlready(!!j?.already);
      setState("ok");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t("beta_err"));
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[120px]" />
      </div>
      <main className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
        <Link href="/" className="mb-8 text-sm text-orange-300/90 transition hover:text-orange-200">
          {t("legal_back_home")}
        </Link>

        {/* O selo dizia "vagas limitadas" e nao ha limite de vagas no codigo —
            so uma data. Diz-se a data, que e verdade e serve de urgencia. */}
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300">
          {t("beta_badge_until").replace("{d}", cutoffStr)}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{t("beta_title")}</h1>
        <p className="mt-3 leading-relaxed text-slate-400">{t("beta_sub")}</p>
        {!betaClosed && <Steps inscrito={state === "ok"} temConta={temConta === true} t={t} />}

        {betaClosed ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-lg font-bold text-white">{t("beta_closed_title")}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("beta_closed_body")}</p>
            <Link href={paymentsFrozen ? `${pageUrl("login", lang)}?mode=signup` : pageUrl("pricing", lang)} className={`${btnPrimary} mt-4 inline-flex px-5 py-2.5 text-sm`}>
              {paymentsFrozen ? t("beta_ok_cta") : t("nav_pricing")}
            </Link>
          </div>
        ) : state === "ok" ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-6">
            <p className="text-lg font-bold text-emerald-300">{already ? t("beta_already_title") : t("beta_ok_title")}</p>
            {/* Duas saidas diferentes: quem ja tem conta nao pode ser mandado
                criar outra, e quem nao tem precisa de ver que FALTA o passo 2,
                e nao um agradecimento que soa a fim de linha. */}
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {temConta ? t("beta_ok_body_account") : t("beta_ok_body")}
            </p>
            {!temConta && (
              <Link href={`/login?mode=signup&next=%2Fbeta&email=${encodeURIComponent(email.trim())}`} className={`${btnPrimary} mt-4 inline-flex px-5 py-2.5 text-sm`}>
                {t("beta_ok_cta")}
              </Link>
            )}
            {/* A ativacao e feita a mao (botao no Telegram). Dizer isso evita o
                tester entrar, ver o plano gratuito e concluir que falhou. */}
            <p className="mt-3 text-xs leading-relaxed text-slate-400">⏳ {t("beta_activation_note")}</p>
            <TelegramCard t={t} />
          </div>
        ) : (
          <form onSubmit={submit} className="relative mt-8 space-y-4">
            {/* A conta e precisa para ativar, mas NAO antes de submeter: o botao
                "criar conta" que aqui estava levava a pessoa para fora da pagina
                antes de deixar o email, e a inscricao perdia-se. Fica so a nota;
                o convite a criar conta vive no estado de sucesso, ja com o email
                preenchido. (31 visitas humanas -> 1 inscricao, 9-11 set.) */}
            {temConta ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3">
                <p className="text-sm leading-relaxed text-emerald-200">{t("beta_have_account_note")}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3">
                <p className="text-sm leading-relaxed text-amber-200">{t("beta_account_warn")}</p>
              </div>
            )}

            {/* Honeypot: bots preenchem; humanos nunca veem. */}
            <div className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
              <label htmlFor="beta-website">Website</label>
              <input id="beta-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div>
              <label htmlFor="beta-email" className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_email_label")}</label>
              <input
                id="beta-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("beta_email_ph")}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>
            <div>
              <label htmlFor="beta-name" className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_name_label")}</label>
              <input
                id="beta-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>
            <div>
              <label htmlFor="beta-note" className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_note_label")}</label>
              <textarea
                id="beta-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t("beta_note_ph")}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>

            {state === "error" && (
              <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</p>
            )}

            <button type="submit" disabled={state === "sending"} className={`${btnPrimary} w-full px-6 py-3 text-base disabled:opacity-60`}>
              {state === "sending" ? t("beta_sending") : temConta ? t("beta_submit_account") : t("beta_submit")}
            </button>
            <p className="text-center text-[11px] text-slate-600">{t("beta_privacy")} · <Link href="/privacidade" className="underline decoration-dotted">{t("legal_privacy_short")}</Link></p>

            {/* Canal de feedback dos testers — visível já antes da inscrição. */}
            <TelegramCard t={t} />
          </form>
        )}
      </main>
    </div>
  );
}
