"use client";

import { useEffect, useRef, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import AppShell from "@/components/AppShell";
import TwoFactorSetup from "@/components/TwoFactorSetup";
import { createClient } from "@/lib/supabase/client";
import { loadNickname, saveNickname, nicknameFromMetadata } from "@/lib/user/nickname";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useTheme, type Theme, type Currency, type NumberFormat } from "@/lib/theme/ThemeContext";

type SubscriptionStatus = { status: string; current_period_end: string | null; price_id?: string | null };
type SettingsSection = "account" | "appearance" | "preferences" | "notifications" | "privacy" | "premium" | "api";
type ApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; is_active: boolean };

const APP_VERSION = "0.1.0";

// ── API Keys component ────────────────────────────────────────────────────
function PremiumApiKeys({ isPremium }: { isPremium: boolean }) {
  const { t } = useLanguage();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);

  useEffect(() => {
    if (!isPremium) return;
    setLoadingKeys(true);
    fetch("/api/api-keys")
      .then(r => r.ok ? r.json() : { keys: [] })
      .then((d: { keys?: ApiKey[] }) => setKeys(d.keys ?? []))
      .finally(() => setLoadingKeys(false));
  }, [isPremium]);

  const createKey = async () => {
    if (creating) return;
    setCreating(true);
    setRevealedKey(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "Chave API" }),
      });
      const data = await res.json() as { key?: string; meta?: ApiKey; error?: string };
      if (data.error) { alert(data.error); return; }
      if (data.key) {
        setRevealedKey(data.key);
        setKeys(prev => [data.meta!, ...prev]);
        setNewKeyName("");
      }
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm(t("ac_revoke_confirm"))) return;
    const res = await fetch("/api/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: id }),
    });
    if (res.ok) setKeys(prev => prev.filter(k => k.id !== id));
  };

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">🔑 API & MCP Access</p>
        {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
      </div>
      {isPremium ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">{t("ac_api_desc")}</p>

          {revealedKey && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-2">
              <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">{t("ac_key_once")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-emerald-300 font-mono break-all">{revealedKey}</code>
                <button type="button" onClick={() => { navigator.clipboard.writeText(revealedKey); }}
                  className="shrink-0 text-[10px] border border-emerald-500/40 text-emerald-400 rounded px-2 py-1 hover:bg-emerald-500/10 transition">
                  Copiar
                </button>
              </div>
            </div>
          )}

          {loadingKeys ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="h-10 rounded-lg bg-slate-800 animate-pulse" />)}
            </div>
          ) : keys.length > 0 ? (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className="rounded-lg bg-slate-950 border border-slate-800 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-200 font-medium truncate">{k.name}</p>
                    <code className="text-[10px] text-slate-500 font-mono">{k.key_prefix}••••••••••••</code>
                    {k.last_used_at && <span className="text-[10px] text-slate-600 ml-2">usado {new Date(k.last_used_at).toLocaleDateString("pt-PT")}</span>}
                  </div>
                  <button type="button" onClick={() => revokeKey(k.id)}
                    className="shrink-0 text-[10px] border border-rose-500/30 text-rose-400 rounded px-2 py-1 hover:bg-rose-500/10 transition">
                    Revogar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t("ac_no_keys")}</p>
          )}

          <div className="flex gap-2">
            <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              placeholder={t("ac_key_name_ph")}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50" />
            <button type="button" onClick={createKey} disabled={creating}
              className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition">
              {creating ? t("ac_creating") : "+ Nova chave"}
            </button>
          </div>

          <div className="space-y-1.5 border-t border-slate-800 pt-3">
            <p className="text-[10px] text-slate-600">{t("ac_endpoint_base")} <code className="text-slate-500">https://owlfund.vercel.app/api/v1/</code> · Cabeçalho: <code className="text-slate-500">Authorization: Bearer cfa_live_…</code></p>
            <ul className="space-y-1">
              {[
                ["GET", "/api/v1", "índice"],
                ["GET", "/api/v1/portfolio", "último snapshot do portefólio"],
                ["GET", "/api/v1/wallets", "carteiras e endereços ligados"],
                ["GET", "/api/v1/whales", "movimentos on-chain (?watchlist=…)"],
                ["GET", "/api/v1/market", "top criptoativos (?limit=N)"],
                ["GET", "/api/v1/known-whales", "baleias conhecidas pré-carregadas"],
              ].map(([method, path, desc]) => (
                <li key={path} className="flex items-baseline gap-2 text-[10px] text-slate-500">
                  <span className="font-mono font-semibold text-emerald-400/80">{method}</span>
                  <code className="text-slate-400">{path}</code>
                  <span className="text-slate-600">— {desc}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-600 pt-1">
              MCP (Claude, Cursor…): <code className="text-slate-500">https://owlfund.vercel.app/api/mcp</code> · mesma chave no cabeçalho <code className="text-slate-500">Authorization</code>. Ferramentas: <code className="text-slate-500">get_portfolio</code>, <code className="text-slate-500">get_wallets</code>, <code className="text-slate-500">get_whale_activity</code>, <code className="text-slate-500">get_market</code>, <code className="text-slate-500">list_known_whales</code>.
            </p>
            <a href="/developers" className="inline-block pt-1 text-[10px] font-semibold text-orange-300/90 hover:text-orange-200">Ver documentação completa →</a>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{t("ac_api_rest_desc")}</p>
      )}
    </div>
  );
}

// ── Webhook de alertas (Premium) ──────────────────────────────────────────
function WebhookConfig({ isPremium }: { isPremium: boolean }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    fetch("/api/webhooks")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.webhook) { setUrl(d.webhook.url ?? ""); setSecret(d.webhook.secret ?? null); } })
      .finally(() => setLoading(false));
  }, [isPremium]);

  const save = async () => {
    setSaving(true); setMsg(null);
    const res = await fetch("/api/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { setSecret(d.webhook?.secret ?? secret); setMsg("Guardado."); } else { setMsg(d.error ?? "Erro."); }
    setSaving(false);
  };
  const remove = async () => {
    await fetch("/api/webhooks", { method: "DELETE" });
    setUrl(""); setSecret(null); setMsg("Removido.");
  };

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">🔔 Webhook de alertas</p>
        {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
      </div>
      {isPremium ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Recebe um POST assinado quando uma baleia da tua watchlist faz um movimento grande — mesmo com a app fechada.</p>
          {!loading && (
            <>
              <div className="flex gap-2">
                <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://o-teu-servidor.com/webhook"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50" />
                <button type="button" onClick={save} disabled={saving}
                  className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition">
                  {saving ? "A guardar…" : "Guardar"}
                </button>
              </div>
              {secret && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">Segredo (verifica a assinatura HMAC-SHA256)</p>
                  <code className="block text-[10px] text-emerald-300 font-mono break-all">{secret}</code>
                  <p className="text-[10px] text-slate-600">Cabeçalho: <code className="text-slate-500">X-ChainFolioAI-Signature: sha256=…</code></p>
                </div>
              )}
              {msg && <p className="text-[10px] text-slate-400">{msg}</p>}
              {url && <button type="button" onClick={remove} className="text-[10px] text-rose-400 hover:text-rose-300 transition">Remover webhook</button>}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Disponível no plano Premium.</p>
      )}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? "bg-orange-500" : "bg-slate-700"
      }`}>
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
        checked ? "translate-x-5" : "translate-x-0"
      }`} />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────
function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/60 last:border-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────
function Select<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as T)}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────
function ThemeCard({ value, current, label, icon, onClick }: {
  value: Theme; current: Theme; label: string; icon: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition ${
        current === value
          ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
          : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-white"
      }`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {current === value && <span className="text-[10px] text-orange-400">✓ Ativo</span>}
    </button>
  );
}

// ── Section nav ───────────────────────────────────────────────────────────
const SECTIONS: { key: SettingsSection; labelKey: string; icon: string }[] = [
  { key: "account",      labelKey: "ac_tab_account",       icon: "👤" },
  { key: "appearance",   labelKey: "ac_tab_appearance",    icon: "🎨" },
  { key: "preferences",  labelKey: "ac_tab_preferences",   icon: "⚙️" },
  { key: "notifications",labelKey: "ac_tab_notifications", icon: "🔔" },
  { key: "privacy",      labelKey: "ac_tab_privacy",       icon: "🔒" },
  { key: "api",          labelKey: "ac_tab_api",           icon: "🔌" },
  { key: "premium",      labelKey: "__premium",            icon: "💎" },
];

export default function AccountPage() {
  const supabase = createClient();
  const { t, lang, setLang } = useLanguage();
  const {
    theme, currency, hideBalances, numberFormat,
    alertsEnabled, autoSnapshot, compactMode,
    setSetting, resetSettings,
  } = useTheme();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [loginProvider, setLoginProvider] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [serverPlan, setServerPlan] = useState<"free" | "pro" | "premium" | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>("account");
  const [resetConfirm, setResetConfirm] = useState(false);

  // Abre a aba indicada no URL (?section=api), p.ex. vindo do menu "API & MCP".
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("section");
    const valid: SettingsSection[] = ["account", "appearance", "preferences", "notifications", "privacy", "api", "premium"];
    if (wanted && (valid as string[]).includes(wanted)) setSection(wanted as SettingsSection);
  }, []);
  // Briefing agendado
  const [briefingEnabled, setBriefingEnabled] = useState(false);
  const [briefingHour, setBriefingHour] = useState(7);
  const [briefingMode, setBriefingMode] = useState<"crypto" | "tradicional" | "both">("crypto");
  const [briefingSaving, setBriefingSaving] = useState(false);
  const [briefingSaved, setBriefingSaved] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  // Nickname
  const [nickname, setNickname] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  // Uso & limites
  const [usage, setUsage] = useState<{ aiUsed: number; aiLimit: number; snapshots: number; wallets: number } | null>(null);
  // Mudar palavra-passe
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Apagar conta
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg({ type: "err", text: t("ac_password_short") }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: "err", text: t("ac_password_mismatch") }); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setPwMsg({ type: "err", text: t("ac_password_error") });
      else { setPwMsg({ type: "ok", text: t("ac_password_saved") }); setNewPassword(""); setConfirmPassword(""); }
    } catch {
      setPwMsg({ type: "err", text: t("ac_password_error") });
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toUpperCase() !== t("ac_delete_word").toUpperCase()) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) { setDeleteError(t("ac_delete_error")); setDeleting(false); return; }
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch {
      setDeleteError(t("ac_delete_error"));
      setDeleting(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const handleExportData = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chainfolioai-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert(t("ac_export_error"));
    } finally {
      setExporting(false);
    }
  };

  const handleSaveNickname = async () => {
    setNicknameSaving(true);
    setNicknameSaved(false);
    try {
      const v = nickname.trim().slice(0, 40);
      saveNickname(v);
      await supabase.auth.updateUser({ data: { nickname: v } });
      setNicknameSaved(true);
      setTimeout(() => setNicknameSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setNicknameSaving(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? null);
      setUserId(user.id);
      setMemberSince(user.created_at ?? null);
      setLoginProvider((user.app_metadata as { provider?: string } | undefined)?.provider ?? null);
      // Nickname: user_metadata (cross-device) com fallback ao cache local
      const nick = nicknameFromMetadata(user.user_metadata) || loadNickname();
      if (nick) { setNickname(nick); saveNickname(nick); }
      // Carregar avatar + preferências
      const { data: profile } = await supabase
        .from("profiles").select("avatar_url, auto_snapshot").eq("id", user.id).maybeSingle();
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile && profile.auto_snapshot !== null && profile.auto_snapshot !== undefined) {
        setSetting("autoSnapshot", profile.auto_snapshot);
      }
      const { data: subData } = await supabase
        .from("subscriptions").select("status, current_period_end, price_id")
        .eq("user_id", user.id).eq("status", "active").order("current_period_end", { ascending: false }).limit(1).maybeSingle();
      setSubscription(subData ?? null);
      // Uso & limites (não bloqueia o carregamento)
      fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then((u: { aiUsed: number; aiLimit: number; snapshots: number; wallets: number } | null) => { if (u) setUsage(u); })
        .catch(() => {});
      // Fetch plan from server-side API (avoids NEXT_PUBLIC env var issue)
      try {
        const planRes = await fetch("/api/subscription");
        if (planRes.ok) {
          const planJson = await planRes.json() as { plan: string };
          if (planJson.plan === "premium") {
            setServerPlan("premium");
          } else {
            // Auto-sync from Stripe to catch missed webhooks
            try {
              const syncRes = await fetch("/api/sync-subscription", { method: "POST" });
              if (syncRes.ok) {
                const syncJson = await syncRes.json() as { synced?: boolean };
                if (syncJson.synced) {
                  // Re-check after sync
                  const recheckRes = await fetch("/api/subscription");
                  if (recheckRes.ok) {
                    const recheckJson = await recheckRes.json() as { plan: string };
                    if (recheckJson.plan === "premium") { setServerPlan("premium"); setLoading(false); return; }
                    setServerPlan(recheckJson.plan === "pro" ? "pro" : "free");
                  } else {
                    setServerPlan(planJson.plan === "pro" ? "pro" : "free");
                  }
                } else {
                  setServerPlan(planJson.plan === "pro" ? "pro" : "free");
                }
              } else {
                setServerPlan(planJson.plan === "pro" ? "pro" : "free");
              }
            } catch {
              setServerPlan(planJson.plan === "pro" ? "pro" : "free");
            }
          }
        }
      } catch { /* ignore */ }
      // Carregar preferências de briefing
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (token) {
        const res = await fetch("/api/news-briefing-schedule", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const pref = await res.json() as { enabled: boolean; hour_utc: number; mode: "crypto" | "tradicional" | "both" };
          setBriefingEnabled(pref.enabled ?? false);
          setBriefingHour(pref.hour_utc ?? 7);
          setBriefingMode(pref.mode ?? "crypto");
        }
      }
      setLoading(false);
    };
    load();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const [signoutOthersDone, setSignoutOthersDone] = useState(false);
  const handleSignOutOthers = async () => {
    try {
      await supabase.auth.signOut({ scope: "others" });
      setSignoutOthersDone(true);
      setTimeout(() => setSignoutOthersDone(false), 3000);
    } catch { /* ignore */ }
  };

  const handleManageBilling = async () => {
    if (!userId) return;
    setBillingError(null);
    const response = await fetch("/api/stripe/portal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await response.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
    else setBillingError(t("acc_billing_error"));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 2 * 1024 * 1024) { alert(t("ac_img_too_big")); return; }
    if (!file.type.startsWith("image/")) { alert(t("ac_file_invalid")); return; }

    setAvatarUploading(true);
    try {
      // Upload para Supabase Storage (bucket: avatars)
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`; // cache busting

      // Guardar URL no perfil
      await supabase.from("profiles").upsert({ id: userId, avatar_url: publicUrl });
      setAvatarUrl(publicUrl);
    } catch (err) {
      alert(t("ac_img_error"));
      console.error(err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isPremium = serverPlan === "premium" || (serverPlan === null && isActive && subscription?.price_id === process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID && !!process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID);
  const isPro = serverPlan === "pro" || (serverPlan === null && isActive && !isPremium);
  const currentPlan = isPremium ? "premium" : isPro ? "pro" : "free";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("pt-PT") : null;

  return (
    <AppShell>
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>
      <div className="relative z-10">
        <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-6">

          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("acc_title")}</p>
            <h1 className="mt-2 text-2xl font-bold text-white">{t("acc_my_account")}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("acc_subtitle")}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[220px_1fr]">

            {/* Left nav */}
            <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
              {SECTIONS.map(s => (
                <button key={s.key} type="button" onClick={() => setSection(s.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    section === s.key
                      ? "bg-orange-500/15 text-orange-300 border border-orange-500/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}>
                  <span className="text-base">{s.icon}</span>
                  {s.labelKey === "__premium" ? "Premium" : t(s.labelKey as TranslationKey)}
                </button>
              ))}
            </nav>

            {/* Right content */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-1">

              {/* ── Conta ── */}
              {section === "account" && (
                <div className="space-y-4">
                  <h2 className="text-base font-bold text-white mb-4">{t("ac_account_info")}</h2>

                  {/* Avatar */}
                  <div className="flex flex-col items-center gap-3 pb-2">
                    <div className="relative group">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-slate-700 hover:border-orange-500/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                        title={t("ac_change_photo")}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                            <span className="text-3xl text-slate-500">
                              {email ? email[0].toUpperCase() : "?"}
                            </span>
                          </div>
                        )}
                        {/* Overlay ao hover */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {avatarUploading ? (
                            <svg className="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                          ) : (
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                          )}
                        </div>
                      </button>
                      {/* Botão + pequeno no canto */}
                      <div className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-orange-500 border-2 border-slate-900 flex items-center justify-center pointer-events-none">
                        <svg className="w-3.5 h-3.5 text-slate-950" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{t("ac_change_photo_hint")}</p>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </div>

                  {/* User info */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                    <SettingRow label={t("acc_email")}>
                      <span className="text-sm text-slate-400">{email ?? "—"}</span>
                    </SettingRow>
                    <SettingRow label={t("ac_member_since")}>
                      <span className="text-sm text-slate-400">{memberSince ? new Date(memberSince).toLocaleDateString() : "—"}</span>
                    </SettingRow>
                    <SettingRow label={t("ac_login_method")}>
                      <span className="text-sm capitalize text-slate-400">{loginProvider ?? "—"}</span>
                    </SettingRow>
                    <SettingRow label={t("ac_nickname")} desc={t("ac_nickname_desc")}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={nickname}
                          onChange={(e) => setNickname(e.target.value)}
                          maxLength={40}
                          placeholder={t("ac_nickname_ph")}
                          className="w-40 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-orange-400"
                        />
                        <button
                          type="button"
                          onClick={handleSaveNickname}
                          disabled={nicknameSaving}
                          className="rounded-lg border border-orange-400/40 px-3 py-1.5 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-50"
                        >
                          {nicknameSaved ? t("ac_nickname_saved") : nicknameSaving ? t("ac_saving") : t("ac_nickname_save")}
                        </button>
                      </div>
                    </SettingRow>
                    <SettingRow label={t("acc_plan")}>
                      {loading ? (
                        <span className="text-xs text-slate-500 animate-pulse">{t("loading")}</span>
                      ) : isPremium ? (
                        <span className="text-sm font-bold text-violet-400">Premium ✓</span>
                      ) : isPro ? (
                        <span className="text-sm font-bold text-emerald-400">Pro ✓</span>
                      ) : (
                        <span className="text-sm text-slate-400">{t("free")}</span>
                      )}
                    </SettingRow>
                    {isPro && periodEnd && (
                      <SettingRow label={t("acc_expires")}>
                        <span className="text-sm text-slate-400">{periodEnd}</span>
                      </SettingRow>
                    )}
                  </div>

                  {/* Uso este mês */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-white mb-3">{t("ac_usage_title")}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">
                          {isPro || isPremium ? t("ac_usage_unlimited") : `${usage?.aiUsed ?? 0}/${usage?.aiLimit ?? 1}`}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_ai")}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">{usage?.wallets ?? 0}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_wallets")}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">{usage?.snapshots ?? 0}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_snapshots")}</p>
                      </div>
                    </div>
                  </div>

                  {/* Plan cards */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Free */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "free" ? "border-orange-500/30 bg-orange-500/5" : "border-slate-800 bg-slate-950/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t("free")}</p>
                        {currentPlan === "free" && <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">{t("ac_current_plan")}</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-400">
                        {[
                          t("ac_f_wallets"),
                          t("pc_r_prices_rt"),
                          t("pc_r_btc_blocks"),
                          t("ac_f_watchlist"),
                          t("ac_f_chat"),
                          t("ac_fifo_calc"),
                          t("ac_f_fire"),
                          t("ac_f_countries"),
                        ].map(f => (
                          <li key={f} className="flex gap-2"><span className="text-emerald-400 shrink-0">✓</span>{f}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-slate-500 font-semibold mt-3">€0/mês</p>
                    </div>
                    {/* Pro */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "pro" ? "border-orange-500/40 bg-orange-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Pro</p>
                        {currentPlan === "pro" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Ativo ✓</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {[
                          t("ac_all_free"),
                          t("ac_p_wallets"),
                          t("ac_p_cex"),
                          t("ac_p_chat"),
                          t("ac_p_briefing"),
                          t("ac_p_alerts"),
                          t("ac_p_countries"),
                          t("ac_p_history"),
                        ].map(f => (
                          <li key={f} className="flex gap-2"><span className="text-orange-400 shrink-0">✓</span>{f}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-orange-300/60 font-semibold mt-3">€14,99/mês</p>
                    </div>
                    {/* Premium */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "premium" ? "border-violet-500/40 bg-violet-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Premium</p>
                        {currentPlan === "premium" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Ativo ✓</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {[
                          t("ac_all_pro"),
                          t("ac_pr_sm"),
                          t("ac_pr_onchain"),
                          t("ac_pr_export"),
                          "API/MCP + webhooks",
                          t("ac_pr_countries"),
                          t("ac_pr_manager"),
                        ].map(f => (
                          <li key={f} className="flex gap-2"><span className="text-violet-400 shrink-0">✓</span>{f}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-violet-300/60 font-semibold mt-3">€39/mês</p>
                    </div>
                  </div>

                  {billingError && <p className="text-xs text-rose-400">{billingError}</p>}

                  <div className="flex flex-wrap gap-3 pt-2">
                    {isPremium ? (
                      <button type="button" onClick={handleManageBilling}
                        className="rounded-full border border-violet-400/40 px-5 py-2.5 text-sm font-semibold text-violet-200 hover:border-violet-400 hover:text-white transition">
                        Gerir Premium
                      </button>
                    ) : isPro ? (
                      <>
                        <button type="button" onClick={handleManageBilling}
                          className="rounded-full border border-orange-400/40 px-5 py-2.5 text-sm font-semibold text-orange-200 hover:border-orange-400 hover:text-white transition">
                          {t("acc_manage")}
                        </button>
                        <a href="/pricing" className="rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/20 transition">
                          Upgrade para Premium →
                        </a>
                      </>
                    ) : (
                      <a href="/pricing" className={`${btnPrimary} px-5 py-2.5 text-sm`}>
                        {t("acc_upgrade")}
                      </a>
                    )}
                    <a href="/pricing" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition">
                      {t("acc_compare_plans")}
                    </a>
                    <button type="button" onClick={async () => {
                      const res = await fetch("/api/sync-subscription", { method: "POST" });
                      const json = await res.json() as { synced?: boolean; error?: string };
                      if (json.synced) window.location.reload();
                      else alert(json.error ?? t("ac_no_sub"));
                    }} className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-white transition">
                      Sincronizar plano
                    </button>
                    <button type="button" onClick={handleLogout}
                      className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:border-rose-500/40 hover:text-rose-400 transition ml-auto">
                      {t("acc_logout")}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Aparência ── */}
              {section === "appearance" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_appearance")}</h2>

                  {/* Theme */}
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-3">{t("ac_theme")}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <ThemeCard value="dark"   current={theme} label={t("ac_dark")}  icon="🌑" onClick={() => setSetting("theme", "dark")} />
                      <ThemeCard value="light"  current={theme} label={t("ac_light")}   icon="☀️" onClick={() => setSetting("theme", "light")} />
                      <ThemeCard value="system" current={theme} label={t("ac_system")}  icon="💻" onClick={() => setSetting("theme", "system")} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {theme === "system" ? "A seguir as preferências do sistema operativo." : theme === "light" ? "Modo claro ativado." : "Modo escuro ativado."}
                    </p>
                  </div>

                  {/* Idioma + modo compacto */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("lang_label")} desc={t("ac_language_desc")}>
                      <Select<typeof lang>
                        value={lang}
                        onChange={setLang}
                        options={[
                          { value: "pt", label: t("lang_pt") },
                          { value: "en", label: t("lang_en") },
                          { value: "es", label: t("lang_es") },
                          { value: "fr", label: t("lang_fr") },
                        ]}
                      />
                    </SettingRow>
                    <SettingRow label={t("ac_compact")} desc={t("ac_compact_desc")}>
                      <Toggle checked={compactMode} onChange={v => setSetting("compactMode", v)} />
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* ── Preferências ── */}
              {section === "preferences" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_preferences")}</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("ac_display_currency")} desc={t("ac_display_currency_desc")}>
                      <Select<Currency> value={currency} onChange={v => setSetting("currency", v)}
                        options={[
                          { value: "EUR", label: "€ EUR — Euro" },
                          { value: "USD", label: "$ USD — Dólar" },
                          { value: "GBP", label: "£ GBP — Libra" },
                          { value: "BTC", label: "₿ BTC — Bitcoin" },
                        ]} />
                    </SettingRow>
                    <SettingRow label={t("ac_number_format")} desc={t("ac_number_format_desc")}>
                      <Select<NumberFormat> value={numberFormat} onChange={v => setSetting("numberFormat", v)}
                        options={[
                          { value: "pt-PT", label: "1.234,56 (PT)" },
                          { value: "en-US", label: "1,234.56 (EN)" },
                        ]} />
                    </SettingRow>
                    <SettingRow label={t("ac_auto_snapshot")} desc={t("ac_auto_snapshot_desc")}>
                      <Toggle checked={autoSnapshot} onChange={v => {
                        setSetting("autoSnapshot", v);
                        if (userId) supabase.from("profiles").upsert({ id: userId, auto_snapshot: v });
                      }} />
                    </SettingRow>
                  </div>

                  {currency !== "EUR" && (
                    <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                      <span>⚠️</span>
                      Conversão aproximada baseada em taxa de câmbio EUR. Atualiza a cada 60s.
                    </p>
                  )}
                </div>
              )}

              {/* ── Notificações ── */}
              {section === "notifications" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_notifications")}</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("ac_whale_alerts")} desc={t("sm2_alerts_appear")}>
                      <Toggle checked={alertsEnabled} onChange={v => setSetting("alertsEnabled", v)} />
                    </SettingRow>
                    <SettingRow label={t("ac_email_alerts")} desc={t("ac_email_alerts_desc")}>
                      <div className="flex items-center gap-2">
                        {!isPro && !isPremium && <span className="text-[10px] text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">Pro</span>}
                        <Toggle checked={(isPro || isPremium) && alertsEnabled} onChange={() => { if (!isPro && !isPremium) window.location.href = "/pricing"; }} />
                      </div>
                    </SettingRow>
                    <SettingRow label={t("ac_btc_blocks")} desc={t("ac_btc_blocks_desc")}>
                      <Toggle checked={true} onChange={() => {}} />
                    </SettingRow>
                    <SettingRow label={t("ac_price_var")} desc={t("ac_price_var_desc")}>
                      <Toggle checked={isPro || isPremium} onChange={() => { if (!isPro && !isPremium) window.location.href = "/pricing"; }} />
                    </SettingRow>
                  </div>

                  {!isPro && !isPremium && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{t("ac_adv_alerts_pro")}</p>
                        <p className="text-xs text-slate-400">{t("ac_adv_alerts_pro_desc")}</p>
                      </div>
                      <a href="/pricing" className={`${btnPrimary} shrink-0 px-4 py-2 text-xs`}>
                        Upgrade
                      </a>
                    </div>
                  )}

                  {/* ── Briefing Agendado ── */}
                  <div className={`rounded-xl border p-5 space-y-4 mt-2 ${isPro || isPremium ? "border-slate-700 bg-slate-900/40" : "border-orange-500/20 bg-orange-500/5"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><img src="/chainfolioai-icon.png" alt="" className="h-4 w-4 rounded-full object-cover" /> Briefing Diário por Email</p>
                          {!isPro && !isPremium && <span className="text-[10px] border border-orange-500/40 text-orange-400 rounded-full px-2 py-0.5">Pro</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{t("ac_briefing_desc")}</p>
                      </div>
                      {isPro || isPremium ? (
                        <Toggle checked={briefingEnabled} onChange={setBriefingEnabled} />
                      ) : (
                        <a href="/pricing" className={`${btnPrimary} px-3 py-1.5 text-xs`}>{t("ac_upgrade")}</a>
                      )}
                    </div>

                    {(isPro || isPremium) && briefingEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-800">
                        {/* Hora de envio — fixa no plano atual */}
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span>🕗</span>{t("ac_send_time_fixed")}
                        </p>
                        {/* Modo */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400">{t("ac_analysis_type")}</p>
                          <div className="flex gap-1">
                            {(["crypto", "tradicional", "both"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setBriefingMode(m)}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                  briefingMode === m
                                    ? "border-orange-400 bg-orange-500/20 text-orange-200"
                                    : "border-slate-700 text-slate-400 hover:border-slate-500"
                                }`}
                              >
                                {m === "crypto" ? t("ac_crypto") : m === "tradicional" ? t("ac_traditional") : t("ac_both")}
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600">Email enviado para: {email ?? "—"}</p>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={briefingSaving || (!isPro && !isPremium)}
                      onClick={async () => {
                        setBriefingSaving(true);
                        setBriefingSaved(false);
                        setBriefingError(null);
                        const { data: sessionData } = await supabase.auth.getSession();
                        const token = sessionData.session?.access_token ?? "";
                        try {
                          const res = await fetch("/api/news-briefing-schedule", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ enabled: briefingEnabled, hour_utc: briefingHour, mode: briefingMode }),
                          });
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({})) as { error?: string };
                            setBriefingError(err.error ?? `Erro ao guardar (${res.status})`);
                          } else {
                            setBriefingSaved(true);
                            setTimeout(() => setBriefingSaved(false), 3000);
                          }
                        } catch {
                          setBriefingError("Erro de rede ao guardar.");
                        }
                        setBriefingSaving(false);
                      }}
                      className={`${btnPrimary} w-full px-4 py-2.5 text-sm`}
                    >
                      {briefingSaving ? t("ac_saving") : briefingSaved ? t("ac_saved") : t("ac_save_schedule")}
                    </button>
                    {briefingError && <p className="text-xs text-red-400">{briefingError}</p>}
                  </div>
                </div>
              )}

              {/* ── Privacidade ── */}
              {section === "privacy" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_privacy_security")}</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("ac_hide_balances")} desc="••••">
                      <Toggle checked={hideBalances} onChange={v => setSetting("hideBalances", v)} />
                    </SettingRow>
                    <SettingRow label={t("ac_readonly_access")} desc={t("ac_readonly_access")}>
                      <span className="text-xs text-emerald-400 font-semibold">✓ Sempre ativo</span>
                    </SettingRow>
                    <SettingRow label={t("ac_data_stored")} desc={t("ac_data_stored_desc")}>
                      <span className="text-xs text-slate-400">Supabase</span>
                    </SettingRow>
                    <SettingRow label={t("ac_export_data")} desc={t("ac_export_data_desc")}>
                      <button type="button" onClick={handleExportData} disabled={exporting}
                        className="text-xs text-orange-400 hover:text-orange-300 transition disabled:opacity-50">
                        {exporting ? t("ac_saving") : t("ac_export_btn")}
                      </button>
                    </SettingRow>
                    <SettingRow label={t("ac_signout_others")} desc={t("ac_signout_others_desc")}>
                      <button type="button" onClick={handleSignOutOthers}
                        className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-400 hover:text-white">
                        {signoutOthersDone ? t("ac_signout_others_done") : t("ac_signout_others_btn")}
                      </button>
                    </SettingRow>
                  </div>

                  {/* Mudar palavra-passe */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-white">{t("ac_change_password")}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t("ac_change_password_desc")}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("ac_new_password_ph")} autoComplete="new-password"
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400" />
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("ac_confirm_password_ph")} autoComplete="new-password"
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400" />
                      <button type="button" onClick={handleChangePassword} disabled={pwSaving || !newPassword}
                        className="shrink-0 rounded-lg border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:opacity-50">
                        {pwSaving ? t("ac_saving") : t("ac_password_save")}
                      </button>
                    </div>
                    {pwMsg && <p className={`text-xs ${pwMsg.type === "ok" ? "text-emerald-400" : "text-rose-400"}`}>{pwMsg.text}</p>}
                  </div>

                  {/* 2FA */}
                  <TwoFactorSetup />

                  {/* Danger zone */}
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-rose-400">{t("ac_danger_zone")}</p>
                    <SettingRow label={t("ac_reset_settings")} desc={t("ac_reset_settings_desc")}>
                      {resetConfirm ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { resetSettings(); setResetConfirm(false); }}
                            className="text-xs text-rose-400 hover:text-rose-300 transition font-semibold">{t("ac_confirm")}</button>
                          <button type="button" onClick={() => setResetConfirm(false)}
                            className="text-xs text-slate-500 hover:text-white transition">{t("ac_cancel")}</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setResetConfirm(true)}
                          className="text-xs border border-rose-500/30 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 transition">
                          Repor
                        </button>
                      )}
                    </SettingRow>
                    <SettingRow label={t("ac_logout_all")} desc={t("ac_logout_all_desc")}>
                      <button type="button" onClick={handleLogout}
                        className="text-xs border border-rose-500/30 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 transition">
                        Sair de tudo
                      </button>
                    </SettingRow>

                    {/* Apagar conta (irreversível) */}
                    <div className="pt-3 border-t border-rose-500/20 space-y-2">
                      <p className="text-sm font-medium text-white">{t("ac_delete_account")}</p>
                      <p className="text-xs text-slate-500">{t("ac_delete_account_desc")}</p>
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                        <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
                          placeholder={t("ac_delete_confirm_label")}
                          className="flex-1 rounded-lg border border-rose-500/30 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500" />
                        <button type="button" onClick={handleDeleteAccount}
                          disabled={deleting || deleteInput.trim().toUpperCase() !== t("ac_delete_word").toUpperCase()}
                          className="shrink-0 rounded-lg bg-rose-500/90 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
                          {deleting ? t("ac_deleting") : t("ac_delete_button")}
                        </button>
                      </div>
                      {deleteError && <p className="text-xs text-rose-400">{deleteError}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Premium ── */}
              {section === "api" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">API & MCP</h2>
                  <PremiumApiKeys isPremium={isPremium} />
                  <WebhookConfig isPremium={isPremium} />
                </div>
              )}

              {section === "premium" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_premium_features")}</h2>

                  {!isPremium && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5 flex flex-col sm:flex-row items-center gap-4">
                      <div className="text-3xl">💎</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white mb-1">{t("ac_premium_plan_39")}</p>
                        <p className="text-xs text-slate-400">{t("ac_premium_plan_desc")}</p>
                      </div>
                      <a href="/pricing" className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/20 transition">
                        Ver Premium →
                      </a>
                    </div>
                  )}

                  {/* Gestor Dedicado IA */}
                  <div className={`rounded-xl border p-5 space-y-4 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">🤖 Gestor Dedicado IA</p>
                      {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
                    </div>
                    {isPremium ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-400">{t("ac_gestor_desc")}</p>
                        <a href="/gestor"
                          className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 transition">
                          🤖 Abrir Gestor Dedicado →
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">{t("ac_gestor_desc2")}</p>
                    )}
                  </div>

                  {/* Smart Money RT status */}
                  <div className={`rounded-xl border p-5 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">📡 Smart Money RT</p>
                        {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
                      </div>
                      {isPremium ? (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Ativo — atualiza cada 60s
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">{t("ac_inactive")}</span>
                      )}
                    </div>
                    {isPremium ? (
                      <p className="text-xs text-slate-400 mt-2">{t("ac_access_page")} <a href="/smart-money" className="text-violet-400 hover:underline">Smart Money</a> {t("ac_watchlist_60s")}</p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-2">{t("ac_sm_rt_desc")}</p>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Rodapé — suporte & versão */}
          <div className="mt-8 flex flex-col items-center gap-2 border-t border-slate-800/60 pt-6 text-center sm:flex-row sm:justify-between">
            <button
              type="button"
              title={t("ac_support_hint")}
              onClick={() => { try { window.dispatchEvent(new Event("chainfolio:open-chat")); } catch { /* ignore */ } }}
              className="text-xs font-semibold text-orange-300/90 transition hover:text-orange-200"
            >
              {t("ac_support")} 💬
            </button>
            <p className="text-[11px] text-slate-600">ChainFolioAI v{APP_VERSION}</p>
          </div>
        </main>
      </div>
    </div>
    </AppShell>
  );
}
