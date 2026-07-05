"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Msg = { text: string; error: boolean } | null;

export default function TwoFactorSetup() {
  const supabase = createClient();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  // Enrollment flow
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const loadFactors = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f: { id: string; status: string }) => f.status === "verified");
    setEnrolled(!!verified);
    setFactorId(verified?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetEnroll = () => {
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setPendingFactorId(null);
    setCode("");
  };

  const startEnroll = async () => {
    setBusy(true);
    setMsg(null);
    // Remover fatores TOTP não verificados pendentes (evita erro de duplicado)
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      setMsg({ text: error?.message ?? "Erro", error: true });
      setBusy(false);
      return;
    }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setPendingFactorId(data.id);
    setEnrolling(true);
    setBusy(false);
  };

  const confirmEnroll = async () => {
    if (!pendingFactorId) return;
    setBusy(true);
    setMsg(null);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
    if (cErr || !challenge) {
      setMsg({ text: cErr?.message ?? "Erro", error: true });
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: pendingFactorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) {
      setMsg({ text: t("ac_2fa_invalid"), error: true });
      setBusy(false);
      return;
    }
    resetEnroll();
    setMsg({ text: t("ac_2fa_ok_on"), error: false });
    await loadFactors();
    setBusy(false);
  };

  const disable2fa = async () => {
    if (!factorId) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMsg({ text: error.message, error: true });
      setBusy(false);
      return;
    }
    setMsg({ text: t("ac_2fa_ok_off"), error: false });
    await loadFactors();
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">🔐 {t("ac_2fa_title")}</p>
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
              enrolled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-slate-600/40 bg-slate-700/40 text-slate-400"
            }`}>
              {loading ? t("ac_2fa_loading") : enrolled ? t("ac_2fa_on") : t("ac_2fa_off")}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-md">{t("ac_2fa_desc")}</p>
        </div>
        {!loading && !enrolling && (
          enrolled ? (
            <button type="button" onClick={disable2fa} disabled={busy}
              className="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition">
              {t("ac_2fa_disable")}
            </button>
          ) : (
            <button type="button" onClick={startEnroll} disabled={busy}
              className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition">
              {t("ac_2fa_enable")}
            </button>
          )
        )}
      </div>

      {enrolling && qrCode && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-300">{t("ac_2fa_scan")}</p>
          <div className="inline-block rounded-lg bg-white p-3">
            {qrCode.startsWith("data:")
              ? <img src={qrCode} alt="QR 2FA" width={160} height={160} />
              : <div className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrCode }} />}
          </div>
          {secret && (
            <div>
              <p className="text-[11px] text-slate-500">{t("ac_2fa_secret")}</p>
              <code className="mt-1 inline-block break-all rounded bg-slate-900 px-2 py-1 text-[11px] text-slate-300">{secret}</code>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-300 mb-1.5">{t("ac_2fa_enter")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm tracking-[0.3em] text-white outline-none focus:border-orange-400"
              />
              <button type="button" onClick={confirmEnroll} disabled={busy || code.length !== 6}
                className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition">
                {t("ac_2fa_confirm")}
              </button>
              <button type="button" onClick={() => { resetEnroll(); setMsg(null); }} disabled={busy}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-50 transition">
                {t("ac_2fa_cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <p className={`text-xs ${msg.error ? "text-rose-400" : "text-emerald-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
