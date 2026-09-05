"use client";

import { useEffect, useMemo, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Msg = { text: string; error: boolean } | null;

export default function TwoFactorSetup() {
  const supabase = useMemo(() => createClient(), []);
  const { t } = useLanguage();
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [copiedCodes, setCopiedCodes] = useState(false);

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
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const fetchRecoveryCodes = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const res = await fetch("/api/mfa/recovery-codes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { codes?: string[] };
      setRecoveryCodes(j.codes ?? null);
    } else {
      const j = (await res.json().catch(() => ({}))) as { code?: string };
      setMsg({ text: j.code === "AAL2_REQUIRED" ? t("ac_2fa_aal2_required") : t("ac_2fa_codes_error"), error: true });
    }
  };

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
      setMsg({ text: error?.message ?? t("error"), error: true });
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
      setMsg({ text: cErr?.message ?? t("error"), error: true });
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
    await fetchRecoveryCodes();
    setBusy(false);
  };

  const regenerateCodes = async () => {
    setBusy(true);
    setMsg(null);
    await fetchRecoveryCodes();
    setBusy(false);
  };

  // Desativar exige o código TOTP atual (challenge + verify) — um clique não chega.
  const disable2fa = async () => {
    if (!factorId) return;
    setBusy(true);
    setMsg(null);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) { setMsg({ text: cErr?.message ?? t("error"), error: true }); setBusy(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: disableCode.trim() });
    if (vErr) { setMsg({ text: t("ac_2fa_invalid"), error: true }); setBusy(false); return; }
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMsg({ text: error.message, error: true });
      setBusy(false);
      return;
    }
    setMsg({ text: t("ac_2fa_ok_off"), error: false });
    setRecoveryCodes(null);
    setDisabling(false); setDisableCode("");
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
            <button type="button" onClick={() => { setDisabling(v => !v); setMsg(null); }} disabled={busy}
              className="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 transition">
              {t("ac_2fa_disable")}
            </button>
          ) : (
            <button type="button" onClick={startEnroll} disabled={busy}
              className={`${btnPrimary} shrink-0 px-3 py-1.5 text-xs`}>
              {t("ac_2fa_enable")}
            </button>
          )
        )}
      </div>

      {disabling && enrolled && (
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-300">{t("ac_2fa_disable_enter")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input inputMode="numeric" maxLength={6} value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label={t("ac_2fa_enter")}
              className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm tracking-[0.3em] text-white outline-none focus:border-rose-400" />
            <button type="button" onClick={disable2fa} disabled={busy || disableCode.length !== 6}
              className="rounded-lg bg-rose-500/90 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 transition">
              {t("ac_2fa_disable")}
            </button>
            <button type="button" onClick={() => { setDisabling(false); setDisableCode(""); }} disabled={busy}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white disabled:opacity-50 transition">
              {t("ac_2fa_cancel")}
            </button>
          </div>
        </div>
      )}

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
                className={`${btnPrimary} px-4 py-2 text-xs`}>
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

      {/* Recovery codes (shown once, right after generating) */}
      {recoveryCodes && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-300">🔑 {t("ac_2fa_codes_title")}</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t("ac_2fa_codes_desc")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950/60 p-3 font-mono text-sm text-slate-200">
            {recoveryCodes.map((c) => <span key={c} className="tracking-wider">{c}</span>)}
          </div>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => { try { navigator.clipboard?.writeText(recoveryCodes.join("\n")).then(() => { setCopiedCodes(true); setTimeout(() => setCopiedCodes(false), 1500); }).catch(() => {}); } catch { /* ignore */ } }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-500 transition">
              {copiedCodes ? t("dev_copied") : t("ac_2fa_codes_copy")}
            </button>
            <button type="button" onClick={() => setRecoveryCodes(null)}
              className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition">
              {t("ac_2fa_codes_saved")}
            </button>
          </div>
        </div>
      )}

      {enrolled && !recoveryCodes && !enrolling && (
        <button type="button" onClick={regenerateCodes} disabled={busy}
          className="text-xs text-slate-400 hover:text-orange-300 disabled:opacity-50 transition">
          {t("ac_2fa_codes_regen")}
        </button>
      )}

      {msg && (
        <p className={`text-xs ${msg.error ? "text-rose-400" : "text-emerald-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
