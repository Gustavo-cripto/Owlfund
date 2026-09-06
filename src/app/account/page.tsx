"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import AppShell from "@/components/AppShell";
import TwoFactorSetup from "@/components/TwoFactorSetup";
import { createClient } from "@/lib/supabase/client";
import { loadNickname, saveNickname, nicknameFromMetadata } from "@/lib/user/nickname";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useTheme, useCurrencyFormat, type Theme, type Currency, type NumberFormat } from "@/lib/theme/ThemeContext";
import { CRYPTO_PAYMENTS_ENABLED } from "@/lib/payments/config";
import { useConfirm } from "@/components/ConfirmDialog";
import { NAMESPACED_BASE_KEYS, ACCOUNTS_EVENT, listAccounts, readNamespaced } from "@/lib/portfolios/accounts";

const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
// Durante o beta os pagamentos estão congelados: CTAs de upgrade → /beta e sem preços.
const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
const upgradeHref = paymentsFrozen ? "/beta" : "/pricing";
const PLAN_PRICES = { pro: 14.99, premium: 39 } as const;
const fmtEurPrice = (v: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: v % 1 ? 2 : 0 }).format(v);
// Extensão do avatar derivada do MIME (nunca do nome do ficheiro → sem SVG/HTML no bucket público).
const AVATAR_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
// Mapeia códigos de erro das rotas para chaves traduzidas.
const API_ERR_KEY: Record<string, TranslationKey> = { MAX_KEYS: "ac_err_max_keys", PREMIUM_REQUIRED: "ac_err_premium", INVALID_URL: "ac_err_invalid_url", UNAUTHENTICATED: "ac_err_unauth" };

function copyText(text: string): Promise<boolean> {
  try { return navigator.clipboard.writeText(text).then(() => true).catch(() => false); } catch { return Promise.resolve(false); }
}

type SubscriptionStatus = { status: string; current_period_end: string | null; price_id?: string | null };
type CryptoSub = {
  status: string;
  currentPeriodEnd: string | null;
  chain: string | null;
  currency: string | null;
  amount: number | null;
  txHash: string | null;
  plan: "pro" | "premium" | null;
  period: "monthly" | "annual" | null;
  provider: string;
  lastPaymentAt: string | null;
};

// Link para o explorer da rede a partir do tx_hash (só leitura, abre em nova aba).
function explorerTxUrl(chain: string | null, txHash: string | null): string | null {
  if (!chain || !txHash) return null;
  const c = chain.toUpperCase();
  if (c === "BTC") return `https://mempool.space/tx/${txHash}`;
  if (c === "ETH" || c === "ETHEREUM" || c === "BASE") return `https://etherscan.io/tx/${txHash}`;
  if (c === "SOL" || c === "SOLANA") return `https://solscan.io/tx/${txHash}`;
  return null;
}
type SettingsSection = "account" | "appearance" | "preferences" | "notifications" | "privacy" | "premium" | "api";
type ApiKey = { id: string; name: string; key_prefix: string; created_at: string; last_used_at: string | null; is_active: boolean };

const APP_VERSION = "0.1.0";

// ── API Keys component ────────────────────────────────────────────────────
function PremiumApiKeys({ isPremium, locale }: { isPremium: boolean; locale: string }) {
  const { t } = useLanguage();
  const askConfirm = useConfirm();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    setLoadingKeys(true);
    fetch("/api/api-keys")
      .then(async r => { const d = await r.json().catch(() => ({})) as { keys?: ApiKey[]; code?: string }; if (!r.ok) throw new Error(d.code ?? "ERR"); return d; })
      .then(d => { if (!cancelled) setKeys(d.keys ?? []); })
      .catch((e: Error) => { if (!cancelled) setKeysError(t(API_ERR_KEY[e.message] ?? "ac_network_error")); })
      .finally(() => { if (!cancelled) setLoadingKeys(false); });
    return () => { cancelled = true; };
  }, [isPremium, t]);

  const createKey = async () => {
    if (creating) return;
    setCreating(true);
    setRevealedKey(null); setKeysError(null); setTestResult(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || t("ac_key_default_name") }),
      });
      const data = await res.json().catch(() => ({})) as { key?: string; meta?: ApiKey; error?: string; code?: string };
      if (!res.ok || !data.key || !data.meta) { setKeysError(t(API_ERR_KEY[data.code ?? ""] ?? "ac_key_create_error")); return; }
      setRevealedKey(data.key);
      setKeys(prev => [data.meta!, ...prev]);
      setNewKeyName("");
    } catch {
      setKeysError(t("ac_network_error"));
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!(await askConfirm({ message: t("ac_revoke_confirm"), danger: true, okLabel: t("ac_revoke") }))) return;
    setKeysError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId: id }),
      });
      if (res.ok) setKeys(prev => prev.filter(k => k.id !== id));
      else setKeysError(t("ac_key_revoke_error"));
    } catch { setKeysError(t("ac_network_error")); }
  };

  // Testa a chave acabada de criar contra o índice público (prova que funciona).
  const testKey = async () => {
    if (!revealedKey) return;
    setTestResult("…");
    try {
      const res = await fetch("/api/v1/portfolio", { headers: { Authorization: `Bearer ${revealedKey}` } });
      setTestResult(res.ok ? `✅ 200 OK — ${t("ac_key_test_ok")}` : `❌ ${res.status} — ${t("ac_key_test_fail")}`);
    } catch { setTestResult(`❌ ${t("ac_network_error")}`); }
  };

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">🔑 {t("ac_api_title")}</p>
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
                <button type="button" onClick={() => { void copyText(revealedKey).then(ok => { setCopied(ok); setTimeout(() => setCopied(false), 1500); }); }}
                  className="shrink-0 text-[10px] border border-emerald-500/40 text-emerald-400 rounded px-2 py-1 hover:bg-emerald-500/10 transition">
                  {copied ? t("dev_copied") : t("dev_copy")}
                </button>
                <button type="button" onClick={testKey}
                  className="shrink-0 text-[10px] border border-slate-600 text-slate-300 rounded px-2 py-1 hover:bg-slate-800 transition">
                  {t("ac_key_test")}
                </button>
              </div>
              {testResult && <p className="text-[10px] text-slate-300">{testResult}</p>}
            </div>
          )}
          {keysError && <p className="text-xs text-rose-300" role="alert">{keysError}</p>}

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
                    {k.last_used_at && <span className="text-[10px] text-slate-600 ml-2">{t("ac_key_last_used")} {new Date(k.last_used_at).toLocaleDateString(locale)}</span>}
                  </div>
                  <button type="button" onClick={() => revokeKey(k.id)} aria-label={`${t("ac_revoke")} ${k.name}`}
                    className="shrink-0 text-[10px] border border-rose-500/30 text-rose-400 rounded px-2 py-1 hover:bg-rose-500/10 transition">
                    {t("ac_revoke")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">{t("ac_no_keys")}</p>
          )}

          <div className="flex gap-2">
            <input type="text" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} maxLength={64} aria-label={t("ac_key_name_ph")}
              placeholder={t("ac_key_name_ph")}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50" />
            <button type="button" onClick={createKey} disabled={creating}
              className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition">
              {creating ? t("ac_creating") : `+ ${t("ac_new_key")}`}
            </button>
          </div>

          <div className="space-y-1.5 border-t border-slate-800 pt-3">
            <p className="text-[10px] text-slate-600 break-all">{t("ac_endpoint_base")} <code className="text-slate-500">https://chainfolioai.com/api/v1/</code> · {t("ac_header_label")} <code className="text-slate-500">Authorization: Bearer cfa_live_…</code></p>
            <p className="text-[10px] text-slate-600 break-all">MCP: <code className="text-slate-500">https://chainfolioai.com/api/mcp</code> · {t("ac_mcp_same_key")} · {t("ac_max_keys")}</p>
            <a href="/developers" className="inline-block pt-1 text-[10px] font-semibold text-orange-300/90 hover:text-orange-200">{t("dev_full_docs")} (12 endpoints · 11 MCP tools) →</a>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{t("ac_api_rest_desc")}</p>
          <a href={upgradeHref} className="inline-block rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition">
            {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : `${t("gz_upgrade")} →`}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Webhook de alertas (Premium) ──────────────────────────────────────────
function WebhookConfig({ isPremium }: { isPremium: boolean }) {
  const { t } = useLanguage();
  const askConfirm = useConfirm();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    let cancelled = false;
    fetch("/api/webhooks")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.webhook) { setUrl(d.webhook.url ?? ""); setSecret(d.webhook.secret ?? null); } })
      .catch(() => { if (!cancelled) setMsg({ ok: false, text: t("ac_network_error") }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isPremium, t]);

  const save = async () => {
    if (saving) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const d = await res.json().catch(() => ({})) as { webhook?: { secret?: string }; code?: string };
      if (res.ok) { setSecret(d.webhook?.secret ?? secret); setShowSecret(true); setMsg({ ok: true, text: t("ac_saved") }); }
      else setMsg({ ok: false, text: t(API_ERR_KEY[d.code ?? ""] ?? "ac_save_error") });
    } catch { setMsg({ ok: false, text: t("ac_network_error") }); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!(await askConfirm({ message: t("ac_webhook_remove_confirm"), danger: true, okLabel: t("remove") }))) return;
    setMsg(null);
    try {
      const res = await fetch("/api/webhooks", { method: "DELETE" });
      if (!res.ok) { setMsg({ ok: false, text: t("ac_save_error") }); return; }
      setUrl(""); setSecret(null); setMsg({ ok: true, text: t("ac_removed") });
    } catch { setMsg({ ok: false, text: t("ac_network_error") }); }
  };

  return (
    <div className={`rounded-xl border p-5 space-y-3 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">🔔 {t("ac_webhook_title")}</p>
        {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
      </div>
      {isPremium ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">{t("ac_webhook_desc")}</p>
          {loading ? (
            <div className="h-9 rounded-lg bg-slate-800 animate-pulse" />
          ) : (
            <>
              {!url && !secret && <p className="text-[10px] text-slate-500">{t("ac_webhook_empty")}</p>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder={t("ac_webhook_ph")} aria-label={t("ac_webhook_title")}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/50" />
                <button type="button" onClick={save} disabled={saving || !url.trim()}
                  className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition">
                  {saving ? t("ac_saving") : t("save")}
                </button>
              </div>
              {secret && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{t("ac_webhook_secret")}</p>
                  <div className="flex items-center gap-2">
                    <code className="block flex-1 text-[10px] text-emerald-300 font-mono break-all">{showSecret ? secret : `${secret.slice(0, 10)}${"•".repeat(24)}`}</code>
                    <button type="button" onClick={() => setShowSecret(v => !v)} className="text-[10px] text-slate-400 hover:text-white">{showSecret ? t("ac_hide") : t("ac_show")}</button>
                  </div>
                  <p className="text-[10px] text-slate-600">{t("ac_header_label")} <code className="text-slate-500">X-ChainFolioAI-Signature: sha256=HMAC_SHA256(secret, body)</code></p>
                </div>
              )}
              {msg && <p className={`text-[10px] ${msg.ok ? "text-emerald-400" : "text-rose-300"}`} role="status">{msg.text}</p>}
              {url && <button type="button" onClick={remove} className="text-[10px] text-rose-400 hover:text-rose-300 transition">{t("ac_webhook_remove")}</button>}
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">{t("ac_premium_only")}</p>
      )}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 disabled:cursor-not-allowed disabled:opacity-50 ${
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
    <div className="flex flex-wrap items-center justify-between gap-2 py-3 border-b border-slate-800/60 last:border-0">
      <div className="flex-1 min-w-[10rem] mr-4">
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────
function Select<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as T)} aria-label={label}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 focus:border-orange-500 cursor-pointer">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Theme card ────────────────────────────────────────────────────────────
function ThemeCard({ value, current, label, icon, onClick, activeLabel }: {
  value: Theme; current: Theme; label: string; icon: string; onClick: () => void; activeLabel: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={current === value}
      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition ${
        current === value
          ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
          : "border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-white"
      }`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {current === value && <span className="text-[10px] text-orange-400">✓ {activeLabel}</span>}
    </button>
  );
}

// ── Section nav ───────────────────────────────────────────────────────────
const SECTIONS: { key: SettingsSection; labelKey: TranslationKey; icon: string }[] = [
  { key: "account",      labelKey: "ac_tab_account",       icon: "👤" },
  { key: "appearance",   labelKey: "ac_tab_appearance",    icon: "🎨" },
  { key: "preferences",  labelKey: "ac_tab_preferences",   icon: "⚙️" },
  { key: "notifications",labelKey: "ac_tab_notifications", icon: "🔔" },
  { key: "privacy",      labelKey: "ac_tab_privacy",       icon: "🔒" },
  { key: "api",          labelKey: "ac_tab_api",           icon: "🔌" },
  { key: "premium",      labelKey: "ac_tab_premium",       icon: "💎" },
];

export default function AccountPage() {
  const supabase = useMemo(() => createClient(), []);
  const { t, lang, setLang } = useLanguage();
  const askConfirm = useConfirm();
  const locale = LOCALE_BY_LANG[lang] ?? "pt-PT";
  const {
    theme, currency, hideBalances, numberFormat,
    alertsEnabled, autoSnapshot, compactMode,
    setSetting, resetSettings,
  } = useTheme();
  const { format: fmtPreview, formatSigned: fmtPreviewSigned } = useCurrencyFormat();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [loginProvider, setLoginProvider] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [cryptoSub, setCryptoSub] = useState<CryptoSub | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [serverPlan, setServerPlan] = useState<"free" | "pro" | "premium" | "unknown" | null>(null);
  const [planSyncing, setPlanSyncing] = useState(false);
  const [planSyncMsg, setPlanSyncMsg] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<number>(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [briefingDirty, setBriefingDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>("account");
  const [resetConfirm, setResetConfirm] = useState(false);

  // Abre a aba indicada no URL (?section=api), p.ex. vindo do menu "API & MCP".
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("section");
    const valid: SettingsSection[] = ["account", "appearance", "preferences", "notifications", "privacy", "api", "premium"];
    if (wanted && (valid as string[]).includes(wanted)) setSection(wanted as SettingsSection);
    const countAccounts = () => { try { setLocalAccounts(listAccounts().length); } catch { /* ignore */ } };
    countAccounts();
    window.addEventListener(ACCOUNTS_EVENT, countAccounts);
    return () => window.removeEventListener(ACCOUNTS_EVENT, countAccounts);
  }, []);
  // Mantém a aba no URL (refresh/back não perdem a secção).
  const goSection = (s: SettingsSection) => {
    setSection(s);
    try { const u = new URL(window.location.href); u.searchParams.set("section", s); window.history.replaceState(null, "", u.toString()); } catch { /* ignore */ }
  };
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

  const needsCurrentPassword = loginProvider === "email";
  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg({ type: "err", text: t("ac_password_short") }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: "err", text: t("ac_password_mismatch") }); return; }
    if (email && newPassword.toLowerCase() === email.toLowerCase()) { setPwMsg({ type: "err", text: t("ac_password_weak") }); return; }
    setPwSaving(true);
    try {
      // Reautenticação: confirma a palavra-passe atual antes de a trocar (sessão roubada não chega).
      if (needsCurrentPassword) {
        if (!currentPassword) { setPwMsg({ type: "err", text: t("ac_current_password_required") }); return; }
        const { error: reErr } = await supabase.auth.signInWithPassword({ email: email ?? "", password: currentPassword });
        if (reErr) { setPwMsg({ type: "err", text: t("ac_current_password_wrong") }); return; }
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setPwMsg({ type: "err", text: t("ac_password_error") });
      else {
        // Termina as outras sessões: quem tinha a palavra-passe antiga deixa de entrar.
        try { await supabase.auth.signOut({ scope: "others" }); } catch { /* ignore */ }
        setPwMsg({ type: "ok", text: t("ac_password_saved_others") }); setNewPassword(""); setConfirmPassword(""); setCurrentPassword("");
      }
    } catch {
      setPwMsg({ type: "err", text: t("ac_password_error") });
    } finally {
      setPwSaving(false);
    }
  };

  const clearLocalData = () => {
    try {
      const keys = Object.keys(window.localStorage);
      for (const k of keys) if (k.startsWith("cf.") || k.startsWith("owlfund") || k.startsWith("portfolio-") || k.startsWith("trade-history") || k.startsWith("gestor") || k.startsWith("chain-")) window.localStorage.removeItem(k);
    } catch { /* ignore */ }
  };
  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toUpperCase() !== t("ac_delete_word").toUpperCase()) return;
    if (!(await askConfirm({ message: t("ac_delete_final_confirm"), danger: true, title: t("ac_delete_account"), okLabel: t("ac_delete_button") }))) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (needsCurrentPassword) {
        if (!deletePassword) { setDeleteError(t("ac_current_password_required")); setDeleting(false); return; }
        const { error: reErr } = await supabase.auth.signInWithPassword({ email: email ?? "", password: deletePassword });
        if (reErr) { setDeleteError(t("ac_current_password_wrong")); setDeleting(false); return; }
      }
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) { setDeleteError(t("ac_delete_error")); setDeleting(false); return; }
      clearLocalData();
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
      const server = await res.json() as Record<string, unknown>;
      // Junta o portefólio LOCAL (contas múltiplas: carteiras, ativos manuais, trades) — é o núcleo do produto e vive no browser.
      let localAccountsData: unknown = null;
      try {
        localAccountsData = listAccounts().map(a => ({
          ...a,
          data: Object.fromEntries(NAMESPACED_BASE_KEYS.map(base => { const raw = readNamespaced(a.id, base); let parsed: unknown = raw; try { parsed = raw ? JSON.parse(raw) : null; } catch { /* raw */ } return [base, parsed]; })),
        }));
      } catch { /* ignore */ }
      const blob = new Blob([JSON.stringify({ ...server, localAccounts: localAccountsData }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chainfolioai-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDeleteError(null);
      setPwMsg({ type: "err", text: t("ac_export_error") });
    } finally {
      setExporting(false);
    }
  };

  const handleSaveNickname = async () => {
    setNicknameSaving(true);
    setNicknameSaved(false); setNicknameError(null);
    try {
      const v = nickname.trim().slice(0, 40);
      if (v.length > 0 && v.length < 2) { setNicknameError(t("ac_nickname_short")); return; }
      const { error } = await supabase.auth.updateUser({ data: { nickname: v } });
      if (error) { setNicknameError(t("ac_save_error")); return; }
      saveNickname(v);
      setNickname(v);
      setNicknameSaved(true);
      setTimeout(() => setNicknameSaved(false), 2000);
    } catch {
      setNicknameError(t("ac_network_error"));
    } finally {
      setNicknameSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { window.location.href = "/login"; return; }
      if (cancelled) return;
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
      if (cancelled) return;
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile && profile.auto_snapshot !== null && profile.auto_snapshot !== undefined) {
        setSetting("autoSnapshot", profile.auto_snapshot);
      }
      const { data: subData } = await supabase
        .from("subscriptions").select("status, current_period_end, price_id")
        .eq("user_id", user.id).eq("status", "active").order("current_period_end", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      setSubscription(subData ?? null);
      // Detalhes da subscrição cripto (rede, tx_hash, renovação) — server-side,
      // porque a tabela crypto_payments é só-service-role. Só quando a flag está on.
      if (CRYPTO_PAYMENTS_ENABLED) {
        fetch("/api/crypto/subscription")
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { crypto: CryptoSub | null } | null) => { if (!cancelled && j?.crypto) setCryptoSub(j.crypto); })
          .catch(() => {});
      }
      // Uso & limites (não bloqueia o carregamento)
      fetch("/api/usage")
        .then((r) => (r.ok ? r.json() : null))
        .then((u: { aiUsed: number; aiLimit: number; snapshots: number; wallets: number } | null) => { if (!cancelled && u) setUsage(u); })
        .catch(() => {});
      // Plano confirmado pelo servidor. Falha de rede/servidor → "unknown" (não bloquear nem vender upgrade).
      try {
        const planRes = await fetch("/api/subscription");
        if (cancelled) return;
        if (planRes.ok) {
          const planJson = await planRes.json() as { plan: string };
          setServerPlan(planJson.plan === "premium" ? "premium" : planJson.plan === "pro" ? "pro" : "free");
        } else setServerPlan("unknown");
      } catch { if (!cancelled) setServerPlan("unknown"); }
      // Sync Stripe só quando se volta do checkout (antes corria em TODOS os loads).
      if (!paymentsFrozen && new URLSearchParams(window.location.search).get("checkout") === "success") void syncPlan();
      // Carregar preferências de briefing
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? "";
        if (token) {
          const res = await fetch("/api/news-briefing-schedule", { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok && !cancelled) {
            const pref = await res.json() as { enabled: boolean; hour_utc: number; mode: "crypto" | "tradicional" | "both" };
            setBriefingEnabled(pref.enabled ?? false);
            setBriefingHour(pref.hour_utc ?? 7);
            setBriefingMode(pref.mode ?? "crypto");
          }
        }
      } catch { /* preferências ficam nos defaults */ }
    };
    load().catch(() => { /* erros individuais já tratados */ }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Verificação manual do plano (sync Stripe + releitura). Substitui o auto-sync em cada load.
  const syncPlan = async () => {
    if (planSyncing) return;
    setPlanSyncing(true); setPlanSyncMsg(null);
    try {
      if (!paymentsFrozen) await fetch("/api/sync-subscription", { method: "POST" }).catch(() => null);
      const res = await fetch("/api/subscription");
      if (!res.ok) { setServerPlan("unknown"); setPlanSyncMsg(t("ac_plan_check_fail")); return; }
      const j = await res.json() as { plan: string };
      setServerPlan(j.plan === "premium" ? "premium" : j.plan === "pro" ? "pro" : "free");
      setPlanSyncMsg(t("ac_plan_check_ok"));
      setTimeout(() => setPlanSyncMsg(null), 3000);
    } catch { setServerPlan("unknown"); setPlanSyncMsg(t("ac_plan_check_fail")); }
    finally { setPlanSyncing(false); }
  };

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
    if (!userId || billingBusy) return;
    setBillingError(null); setBillingBusy(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
      setBillingError(t("acc_billing_error"));
    } catch { setBillingError(t("acc_billing_error")); }
    finally { setBillingBusy(false); }
  };

  // Renovar subscrição cripto: reabre o checkout Helio para o mesmo plano/período.
  // Renovação = novo pagamento que soma um período (dados/histórico ficam intactos).
  const handleRenewCrypto = async () => {
    if (!cryptoSub?.plan || !cryptoSub?.period) { window.location.href = upgradeHref; return; }
    setRenewing(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/crypto/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: cryptoSub.plan, period: cryptoSub.period }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setBillingError(data.error ?? t("acc_billing_error"));
    } catch {
      setBillingError(t("acc_billing_error"));
    }
    setRenewing(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const ext = AVATAR_EXT[file.type];
    if (file.size > 2 * 1024 * 1024) { setAvatarError(t("ac_img_too_big")); return; }
    if (!ext) { setAvatarError(t("ac_file_invalid")); return; }
    setAvatarError(null);

    setAvatarUploading(true);
    try {
      // Upload para Supabase Storage (bucket: avatars) — extensão pelo MIME, nunca pelo nome.
      const path = `${userId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`; // cache busting

      // Guardar URL no perfil
      const { error: profErr } = await supabase.from("profiles").upsert({ id: userId, avatar_url: publicUrl });
      if (profErr) throw profErr;
      setAvatarUrl(publicUrl);
    } catch (err) {
      setAvatarError(t("ac_img_error"));
      console.error(err);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const isPremium = serverPlan === "premium";
  const isPro = serverPlan === "pro";
  const planUnknown = serverPlan === "unknown";
  const currentPlan = isPremium ? "premium" : isPro ? "pro" : "free";
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(locale) : null;
  const upgradeLabel = paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : null;

  // Subscrição paga em cripto (pré-pago + renovação manual). Fica "expirada" quando
  // o período já passou — mas os dados/histórico do utilizador nunca são apagados.
  const isCrypto = !!cryptoSub;
  const cryptoEnd = cryptoSub?.currentPeriodEnd ? new Date(cryptoSub.currentPeriodEnd) : null;
  const cryptoExpired = !!cryptoEnd && cryptoEnd.getTime() < Date.now();
  const cryptoEndLabel = cryptoEnd ? cryptoEnd.toLocaleDateString(locale) : null;
  const cryptoTxUrl = explorerTxUrl(cryptoSub?.chain ?? null, cryptoSub?.txHash ?? null);

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
            <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0" role="tablist" aria-label={t("acc_my_account")}>
              {SECTIONS.map(s => (
                <button key={s.key} type="button" role="tab" aria-selected={section === s.key} onClick={() => goSection(s.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition whitespace-nowrap ${
                    section === s.key
                      ? "bg-orange-500/15 text-orange-300 border border-orange-500/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}>
                  <span className="text-base">{s.icon}</span>
                  {t(s.labelKey)}
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
                          <img src={avatarUrl} alt={t("ac_change_photo")} className="w-full h-full object-cover" />
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
                    {avatarError && <p className="text-xs text-rose-300" role="alert">{avatarError}</p>}
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
                      <span className="text-sm text-slate-400">{memberSince ? new Date(memberSince).toLocaleDateString(locale) : "—"}</span>
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
                          aria-label={t("ac_nickname")}
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
                      {nicknameError && <p className="w-full text-xs text-rose-300" role="alert">{nicknameError}</p>}
                    </SettingRow>
                    <SettingRow label={t("acc_plan")}>
                      <div className="flex items-center gap-2">
                        {loading ? (
                          <span className="text-xs text-slate-500 animate-pulse">{t("loading")}</span>
                        ) : planUnknown ? (
                          <span className="text-xs text-amber-300">— {t("ac_plan_unknown")}</span>
                        ) : isPremium ? (
                          <span className="text-sm font-bold text-violet-400">Premium ✓</span>
                        ) : isPro ? (
                          <span className="text-sm font-bold text-emerald-400">Pro ✓</span>
                        ) : (
                          <span className="text-sm text-slate-400">{t("free")}</span>
                        )}
                        {!loading && (
                          <button type="button" onClick={syncPlan} disabled={planSyncing} title={t("ac_plan_check")}
                            className="text-[10px] text-slate-500 hover:text-white disabled:opacity-50">{planSyncing ? "…" : "↻"}</button>
                        )}
                      </div>
                      {planSyncMsg && <p className="w-full text-[10px] text-slate-400">{planSyncMsg}</p>}
                    </SettingRow>
                    {isPro && !isPremium && !isCrypto && (
                      <SettingRow label={t("ac_plan_source")}>
                        <span className="text-xs text-slate-400">{paymentsFrozen ? t("ac_plan_source_beta") : "Stripe"}</span>
                      </SettingRow>
                    )}
                    {isPro && periodEnd && !isCrypto && (
                      <SettingRow label={t("acc_expires")}>
                        <span className="text-sm text-slate-400">{periodEnd}</span>
                      </SettingRow>
                    )}
                    {isCrypto && (
                      <>
                        <SettingRow label={t("acc_pay_method")}>
                          <span className="text-sm font-semibold text-orange-300">
                            ₿ {t("pc_pay_crypto")}{cryptoSub?.currency ? ` · ${cryptoSub.currency}` : ""}
                          </span>
                        </SettingRow>
                        {cryptoSub?.chain && (
                          <SettingRow label={t("acc_crypto_network")}>
                            <span className="text-sm text-slate-300">
                              {cryptoTxUrl ? (
                                <a href={cryptoTxUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-orange-300 hover:text-orange-200 underline decoration-dotted">
                                  {cryptoSub.chain} · {t("acc_crypto_view_tx")} ↗
                                </a>
                              ) : cryptoSub.chain}
                            </span>
                          </SettingRow>
                        )}
                        {cryptoEndLabel && (
                          <SettingRow label={cryptoExpired ? t("acc_crypto_expired_on") : t("acc_crypto_renews")}>
                            <span className={`text-sm ${cryptoExpired ? "text-rose-400 font-semibold" : "text-slate-300"}`}>
                              {cryptoEndLabel}
                            </span>
                          </SettingRow>
                        )}
                      </>
                    )}
                  </div>

                  {/* Uso este mês */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-white mb-3">{t("ac_usage_title")}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">
                          {!usage && loading ? "—" : isPro || isPremium ? t("ac_usage_unlimited") : `${usage?.aiUsed ?? 0}/${usage?.aiLimit ?? 1}`}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_ai")}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">{usage ? usage.wallets : "—"}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_wallets")}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">{usage ? usage.snapshots : "—"}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_snapshots")}</p>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center">
                        <p className="text-lg font-black text-white">{localAccounts}/{isPremium ? 10 : isPro ? 3 : 1}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{t("ac_usage_accounts")}</p>
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
                      <p className="text-xs text-slate-500 font-semibold mt-3">{fmtEurPrice(0, locale)}/{t("lp_plan_mo").replace("/", "").trim()}</p>
                    </div>
                    {/* Pro */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "pro" ? "border-orange-500/40 bg-orange-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-orange-400">Pro</p>
                        {currentPlan === "pro" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">{t("ac_active")} ✓</span>}
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
                      <p className="text-xs text-orange-300/60 font-semibold mt-3">{paymentsFrozen ? t("ac_free_in_beta") : `${fmtEurPrice(PLAN_PRICES.pro, locale)}/${t("lp_plan_mo").replace("/", "").trim()}`}</p>
                    </div>
                    {/* Premium */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "premium" ? "border-violet-500/40 bg-violet-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Premium</p>
                        {currentPlan === "premium" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">{t("ac_active")} ✓</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {[
                          t("ac_all_pro"),
                          t("ac_pr_sm"),
                          t("ac_pr_onchain"),
                          t("ac_pr_export"),
                          t("ac_pr_api"),
                          t("ac_pr_countries"),
                          t("ac_pr_manager"),
                        ].map(f => (
                          <li key={f} className="flex gap-2"><span className="text-violet-400 shrink-0">✓</span>{f}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-violet-300/60 font-semibold mt-3">{paymentsFrozen ? t("ac_free_in_beta") : `${fmtEurPrice(PLAN_PRICES.premium, locale)}/${t("lp_plan_mo").replace("/", "").trim()}`}</p>
                    </div>
                  </div>

                  {billingError && <p className="text-xs text-rose-400">{billingError}</p>}

                  <div className="flex flex-wrap gap-3 pt-2">
                    {isCrypto ? (
                      <button type="button" onClick={handleRenewCrypto} disabled={renewing}
                        className={`${btnPrimary} px-5 py-2.5 text-sm disabled:opacity-50`}>
                        {renewing ? t("ac_saving") : cryptoExpired ? t("acc_crypto_renew_expired") : t("acc_crypto_renew")}
                      </button>
                    ) : planUnknown ? (
                      <button type="button" onClick={syncPlan} disabled={planSyncing}
                        className="rounded-full border border-amber-400/40 px-5 py-2.5 text-sm font-semibold text-amber-200 hover:border-amber-400 hover:text-white transition disabled:opacity-50">
                        ↻ {t("ac_plan_check")}
                      </button>
                    ) : isPremium ? (
                      !paymentsFrozen && (
                        <button type="button" onClick={handleManageBilling} disabled={billingBusy}
                          className="rounded-full border border-violet-400/40 px-5 py-2.5 text-sm font-semibold text-violet-200 hover:border-violet-400 hover:text-white transition disabled:opacity-50">
                          {billingBusy ? t("ac_saving") : t("acc_manage")}
                        </button>
                      )
                    ) : isPro ? (
                      <>
                        {!paymentsFrozen && (
                          <button type="button" onClick={handleManageBilling} disabled={billingBusy}
                            className="rounded-full border border-orange-400/40 px-5 py-2.5 text-sm font-semibold text-orange-200 hover:border-orange-400 hover:text-white transition disabled:opacity-50">
                            {billingBusy ? t("ac_saving") : t("acc_manage")}
                          </button>
                        )}
                        <a href={upgradeHref} className="rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/20 transition">
                          {upgradeLabel ?? `${t("ac_upgrade_premium")} →`}
                        </a>
                      </>
                    ) : (
                      <a href={upgradeHref} className={`${btnPrimary} px-5 py-2.5 text-sm`}>
                        {upgradeLabel ?? t("acc_upgrade")}
                      </a>
                    )}
                    {(isPremium || isCrypto) && (
                      <a href="/pricing" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition">
                        {t("acc_compare_plans")}
                      </a>
                    )}
                    {paymentsFrozen && !isPremium && !planUnknown && (
                      <p className="w-full text-[11px] text-slate-500">{t("ac_beta_note")}</p>
                    )}
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
                      <ThemeCard value="dark"   current={theme} label={t("ac_dark")}  icon="🌑" activeLabel={t("ac_active")} onClick={() => setSetting("theme", "dark")} />
                      <ThemeCard value="light"  current={theme} label={t("ac_light")}   icon="☀️" activeLabel={t("ac_active")} onClick={() => setSetting("theme", "light")} />
                      <ThemeCard value="system" current={theme} label={t("ac_system")}  icon="💻" activeLabel={t("ac_active")} onClick={() => setSetting("theme", "system")} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {theme === "system" ? t("ac_theme_hint_system") : theme === "light" ? t("ac_theme_hint_light") : t("ac_theme_hint_dark")}
                    </p>
                  </div>

                  {/* Idioma + modo compacto */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("lang_label")} desc={t("ac_language_desc")}>
                      <Select<typeof lang>
                        value={lang}
                        label={t("lang_label")}
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
                      <Toggle label={t("ac_compact")} checked={compactMode} onChange={v => setSetting("compactMode", v)} />
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
                      <Select<Currency> value={currency} label={t("ac_display_currency")} onChange={v => setSetting("currency", v)}
                        options={[
                          { value: "EUR", label: "€ EUR — Euro" },
                          { value: "USD", label: `$ USD — ${t("ac_cur_usd")}` },
                          { value: "GBP", label: `£ GBP — ${t("ac_cur_gbp")}` },
                          { value: "BTC", label: "₿ BTC — Bitcoin" },
                        ]} />
                    </SettingRow>
                    <SettingRow label={t("ac_number_format")} desc={t("ac_number_format_desc")}>
                      <Select<NumberFormat> value={numberFormat} label={t("ac_number_format")} onChange={v => setSetting("numberFormat", v)}
                        options={[
                          { value: "pt-PT", label: "1.234,56 (PT)" },
                          { value: "en-US", label: "1,234.56 (EN)" },
                        ]} />
                    </SettingRow>
                    <SettingRow label={t("ac_preview")} desc={t("ac_preview_desc")}>
                      <span className="font-mono text-sm text-orange-200">{fmtPreview(1234.56)} · {fmtPreviewSigned(-56.78)}</span>
                    </SettingRow>
                    <SettingRow label={t("ac_auto_snapshot")} desc={t("ac_auto_snapshot_desc")}>
                      <Toggle label={t("ac_auto_snapshot")} checked={autoSnapshot} onChange={v => {
                        setSetting("autoSnapshot", v);
                        // O builder do Supabase é lazy: sem .then() o pedido nunca era enviado.
                        if (userId) void supabase.from("profiles").upsert({ id: userId, auto_snapshot: v }).then((r: { error: { message: string } | null }) => { if (r.error) console.error("[account] auto_snapshot", r.error.message); });
                      }} />
                    </SettingRow>
                  </div>

                  {currency !== "EUR" && (
                    <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                      <span>⚠️</span>
                      {t("ac_fx_note")}
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
                      <Toggle label={t("ac_whale_alerts")} checked={alertsEnabled} onChange={v => setSetting("alertsEnabled", v)} />
                    </SettingRow>
                    <SettingRow label={t("ac_email_alerts")} desc={t("ac_email_alerts_desc")}>
                      {isPro || isPremium ? (
                        <span className="text-[10px] rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">{t("ac_included")}</span>
                      ) : (
                        <a href={upgradeHref} className="text-[10px] rounded-full border border-orange-500/30 px-2 py-0.5 text-orange-400 hover:bg-orange-500/10">Pro →</a>
                      )}
                    </SettingRow>
                    <SettingRow label={t("ac_btc_blocks")} desc={t("ac_btc_blocks_desc")}>
                      <span className="text-[10px] rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">{t("ac_included")}</span>
                    </SettingRow>
                    <SettingRow label={t("ac_price_var")} desc={t("ac_price_var_desc")}>
                      {isPro || isPremium ? (
                        <span className="text-[10px] rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">{t("ac_included")}</span>
                      ) : (
                        <a href={upgradeHref} className="text-[10px] rounded-full border border-orange-500/30 px-2 py-0.5 text-orange-400 hover:bg-orange-500/10">Pro →</a>
                      )}
                    </SettingRow>
                  </div>

                  {!isPro && !isPremium && !planUnknown && !loading && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex flex-wrap items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div className="flex-1 min-w-[12rem]">
                        <p className="text-sm font-semibold text-white">{t("ac_adv_alerts_pro")}</p>
                        <p className="text-xs text-slate-400">{t("ac_adv_alerts_pro_desc")}</p>
                      </div>
                      <a href={upgradeHref} className={`${btnPrimary} shrink-0 px-4 py-2 text-xs`}>
                        {upgradeLabel ?? t("ac_upgrade")}
                      </a>
                    </div>
                  )}

                  {/* ── Briefing Agendado ── */}
                  <div className={`rounded-xl border p-5 space-y-4 mt-2 ${isPro || isPremium ? "border-slate-700 bg-slate-900/40" : "border-orange-500/20 bg-orange-500/5"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-white"><img src="/chainfolioai-icon.png" alt="" className="h-4 w-4 rounded-full object-cover" /> {t("ac_p_briefing")}</p>
                          {!isPro && !isPremium && <span className="text-[10px] border border-orange-500/40 text-orange-400 rounded-full px-2 py-0.5">Pro</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{t("ac_briefing_desc")}</p>
                      </div>
                      {isPro || isPremium ? (
                        <Toggle label={t("ac_p_briefing")} checked={briefingEnabled} onChange={v => { setBriefingEnabled(v); setBriefingDirty(true); }} />
                      ) : (
                        <a href={upgradeHref} className={`${btnPrimary} px-3 py-1.5 text-xs`}>{upgradeLabel ?? t("ac_upgrade")}</a>
                      )}
                    </div>

                    {(isPro || isPremium) && briefingEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-800">
                        {/* Hora de envio — fixa no plano atual */}
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span>🕗</span>{t("ac_send_time_fixed")}
                        </p>
                        {/* Modo */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-400">{t("ac_analysis_type")}</p>
                          <div className="flex flex-wrap gap-1">
                            {(["crypto", "tradicional", "both"] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                aria-pressed={briefingMode === m}
                                onClick={() => { setBriefingMode(m); setBriefingDirty(true); }}
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
                        <p className="text-[11px] text-slate-600">{t("ac_email_sent_to")} {email ?? "—"}</p>
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
                            setBriefingError(`${t("ac_save_error")} (${res.status})`);
                          } else {
                            setBriefingSaved(true); setBriefingDirty(false);
                            setTimeout(() => setBriefingSaved(false), 3000);
                          }
                        } catch {
                          setBriefingError(t("ac_network_error"));
                        }
                        setBriefingSaving(false);
                      }}
                      className={`${btnPrimary} w-full px-4 py-2.5 text-sm ${briefingDirty ? "ring-2 ring-orange-400/50" : ""}`}
                    >
                      {briefingSaving ? t("ac_saving") : briefingSaved ? t("ac_saved") : briefingDirty ? `${t("ac_save_schedule")} •` : t("ac_save_schedule")}
                    </button>
                    {briefingDirty && !briefingSaving && <p className="text-[10px] text-amber-300">{t("ac_unsaved")}</p>}
                    {briefingError && <p className="text-xs text-red-400">{briefingError}</p>}
                  </div>
                </div>
              )}

              {/* ── Privacidade ── */}
              {section === "privacy" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">{t("ac_privacy_security")}</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label={t("ac_hide_balances")} desc={t("ac_hide_balances_desc")}>
                      <Toggle label={t("ac_hide_balances")} checked={hideBalances} onChange={v => setSetting("hideBalances", v)} />
                    </SettingRow>
                    <SettingRow label={t("ac_readonly_access")} desc={t("ac_readonly_access_desc")}>
                      <span className="text-xs text-emerald-400 font-semibold">✓ {t("ac_always_on")}</span>
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
                    {loginProvider && !needsCurrentPassword && <p className="text-[11px] text-slate-500">{t("ac_oauth_password_note").replace("{p}", loginProvider)}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {needsCurrentPassword && (
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder={t("ac_current_password_ph")} autoComplete="current-password" aria-label={t("ac_current_password_ph")}
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400" />
                      )}
                      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("ac_new_password_ph")} autoComplete="new-password" aria-label={t("ac_new_password_ph")}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-orange-400" />
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("ac_confirm_password_ph")} autoComplete="new-password" aria-label={t("ac_confirm_password_ph")}
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
                          {t("ac_reset_btn")}
                        </button>
                      )}
                    </SettingRow>
                    <SettingRow label={t("ac_logout_all")} desc={t("ac_logout_all_desc")}>
                      <button type="button" onClick={handleLogout}
                        className="text-xs border border-rose-500/30 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 transition">
                        {t("ac_logout_all_btn")}
                      </button>
                    </SettingRow>

                    {/* Apagar conta (irreversível) */}
                    <div className="pt-3 border-t border-rose-500/20 space-y-2">
                      <p className="text-sm font-medium text-white">{t("ac_delete_account")}</p>
                      <p className="text-xs text-slate-500">{t("ac_delete_account_desc")}</p>
                      <ul className="text-[11px] text-slate-500 list-disc pl-4 space-y-0.5">
                        <li>{t("ac_delete_list_1")}</li><li>{t("ac_delete_list_2")}</li><li>{t("ac_delete_list_3")}</li>
                      </ul>
                      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                        {needsCurrentPassword && (
                          <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder={t("ac_current_password_ph")} autoComplete="current-password" aria-label={t("ac_current_password_ph")}
                            className="flex-1 rounded-lg border border-rose-500/30 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500" />
                        )}
                        <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} aria-label={t("ac_delete_confirm_label")}
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
                  <h2 className="text-base font-bold text-white">{t("ac_tab_api")}</h2>
                  {planUnknown && <p className="text-xs text-amber-300">⚠️ {t("ac_plan_unknown_long")}</p>}
                  <PremiumApiKeys isPremium={isPremium} locale={locale} />
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
                        <p className="text-sm font-bold text-white mb-1">{paymentsFrozen ? t("ac_premium_plan_beta") : t("ac_premium_plan_39")}</p>
                        <p className="text-xs text-slate-400">{t("ac_premium_plan_desc")}</p>
                      </div>
                      <a href={upgradeHref} className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/20 transition">
                        {upgradeLabel ?? `${t("ac_see_premium")} →`}
                      </a>
                    </div>
                  )}

                  {/* Gestor Dedicado IA */}
                  <div className={`rounded-xl border p-5 space-y-4 ${isPremium ? "border-slate-700 bg-slate-900/40" : "border-violet-500/10 bg-slate-950/40"}`}>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">🤖 {t("df_gestor_l")}</p>
                      {!isPremium && <span className="text-[10px] border border-violet-500/40 text-violet-400 rounded-full px-2 py-0.5">Premium</span>}
                    </div>
                    {isPremium ? (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-400">{t("ac_gestor_desc")}</p>
                        <a href="/gestor"
                          className="inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 transition">
                          🤖 {t("ac_open_gestor")} →
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
                          {t("ac_sm_rt_active")}
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
