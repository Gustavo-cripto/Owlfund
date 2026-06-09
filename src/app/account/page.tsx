"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useTheme, type Theme, type Currency, type NumberFormat } from "@/lib/theme/ThemeContext";

type SubscriptionStatus = { status: string; current_period_end: string | null; price_id?: string | null };
type SettingsSection = "account" | "appearance" | "preferences" | "notifications" | "privacy";

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
const SECTIONS: { key: SettingsSection; label: string; icon: string }[] = [
  { key: "account",      label: "Conta",          icon: "👤" },
  { key: "appearance",   label: "Aparência",       icon: "🎨" },
  { key: "preferences",  label: "Preferências",    icon: "⚙️" },
  { key: "notifications",label: "Notificações",    icon: "🔔" },
  { key: "privacy",      label: "Privacidade",     icon: "🔒" },
];

export default function AccountPage() {
  const supabase = createClient();
  const { t } = useLanguage();
  const {
    theme, currency, hideBalances, numberFormat,
    alertsEnabled, autoSnapshot, compactMode,
    setSetting, resetSettings,
  } = useTheme();

  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>("account");
  const [resetConfirm, setResetConfirm] = useState(false);
  // Briefing agendado
  const [briefingEnabled, setBriefingEnabled] = useState(false);
  const [briefingHour, setBriefingHour] = useState(7);
  const [briefingMode, setBriefingMode] = useState<"crypto" | "tradicional" | "both">("crypto");
  const [briefingSaving, setBriefingSaving] = useState(false);
  const [briefingSaved, setBriefingSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { window.location.href = "/login"; return; }
      setEmail(user.email ?? null);
      setUserId(user.id);
      const { data: subData } = await supabase
        .from("subscriptions").select("status, current_period_end, price_id")
        .eq("user_id", user.id).order("current_period_end", { ascending: false }).limit(1).maybeSingle();
      setSubscription(subData ?? null);
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

  const premiumPriceId = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID;
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const isPremium = isActive && !!premiumPriceId && subscription?.price_id === premiumPriceId;
  const isPro = isActive && !isPremium;
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
                  {s.label}
                </button>
              ))}
            </nav>

            {/* Right content */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-1">

              {/* ── Conta ── */}
              {section === "account" && (
                <div className="space-y-4">
                  <h2 className="text-base font-bold text-white mb-4">Informações da conta</h2>

                  {/* User info */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                    <SettingRow label={t("acc_email")}>
                      <span className="text-sm text-slate-400">{email ?? "—"}</span>
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

                  {/* Plan cards */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Free */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "free" ? "border-orange-500/30 bg-orange-500/5" : "border-slate-800 bg-slate-950/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Gratuito</p>
                        {currentPlan === "free" && <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">Plano atual</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-400">
                        {[
                          "3 carteiras on-chain",
                          "Preços em tempo real",
                          "Blocos BTC ao vivo",
                          "Watchlist (5 baleias)",
                          "Chat IA (5/mês)",
                          "Calculadora FIFO",
                          "Calculadora FIRE básica",
                          "4 países fiscais",
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
                          "Tudo do Gratuito",
                          "Carteiras ilimitadas",
                          "CEX + hardware wallets",
                          "Chat IA ilimitado",
                          "Briefing diário por email",
                          "Alertas de baleias",
                          "8+ países fiscais",
                          "1 ano de histórico",
                        ].map(f => (
                          <li key={f} className="flex gap-2"><span className="text-orange-400 shrink-0">✓</span>{f}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-orange-300/60 font-semibold mt-3">€9,99/mês</p>
                    </div>
                    {/* Premium */}
                    <div className={`rounded-xl border p-4 ${currentPlan === "premium" ? "border-violet-500/40 bg-violet-500/5" : "border-slate-700 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Premium</p>
                        {currentPlan === "premium" && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Ativo ✓</span>}
                      </div>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {[
                          "Tudo do Pro",
                          "Smart Money em tempo real",
                          "Análise on-chain",
                          "Exportação fiscal avançada",
                          "API/MCP + webhooks",
                          "Todos os países fiscais",
                          "Gestor dedicado",
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
                      <a href="/pricing" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 transition">
                        {t("acc_upgrade")}
                      </a>
                    )}
                    <a href="/pricing" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition">
                      {t("acc_compare_plans")}
                    </a>
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
                  <h2 className="text-base font-bold text-white">Aparência</h2>

                  {/* Theme */}
                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-3">Tema</p>
                    <div className="grid grid-cols-3 gap-3">
                      <ThemeCard value="dark"   current={theme} label="Escuro"  icon="🌑" onClick={() => setSetting("theme", "dark")} />
                      <ThemeCard value="light"  current={theme} label="Claro"   icon="☀️" onClick={() => setSetting("theme", "light")} />
                      <ThemeCard value="system" current={theme} label="Sistema"  icon="💻" onClick={() => setSetting("theme", "system")} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {theme === "system" ? "A seguir as preferências do sistema operativo." : theme === "light" ? "Modo claro ativado." : "Modo escuro ativado."}
                    </p>
                  </div>

                  {/* Compact mode */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <SettingRow label="Modo compacto" desc="Reduz espaçamento e tamanho de fontes para ver mais informação.">
                      <Toggle checked={compactMode} onChange={v => setSetting("compactMode", v)} />
                    </SettingRow>
                  </div>
                </div>
              )}

              {/* ── Preferências ── */}
              {section === "preferences" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">Preferências</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label="Moeda de exibição" desc="Converte os valores para a moeda selecionada.">
                      <Select<Currency> value={currency} onChange={v => setSetting("currency", v)}
                        options={[
                          { value: "EUR", label: "€ EUR — Euro" },
                          { value: "USD", label: "$ USD — Dólar" },
                          { value: "GBP", label: "£ GBP — Libra" },
                          { value: "BTC", label: "₿ BTC — Bitcoin" },
                        ]} />
                    </SettingRow>
                    <SettingRow label="Formato de números" desc="Estilo de separadores decimais e de milhar.">
                      <Select<NumberFormat> value={numberFormat} onChange={v => setSetting("numberFormat", v)}
                        options={[
                          { value: "pt-PT", label: "1.234,56 (PT)" },
                          { value: "en-US", label: "1,234.56 (EN)" },
                        ]} />
                    </SettingRow>
                    <SettingRow label="Snapshot automático" desc="Guarda um snapshot diário do portfolio para o histórico PNL.">
                      <Toggle checked={autoSnapshot} onChange={v => setSetting("autoSnapshot", v)} />
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
                  <h2 className="text-base font-bold text-white">Notificações</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label="Alertas de baleias" desc="Notificações quando uma baleia na watchlist mover > $100k.">
                      <Toggle checked={alertsEnabled} onChange={v => setSetting("alertsEnabled", v)} />
                    </SettingRow>
                    <SettingRow label="Alertas por email" desc="Recebe alertas no email da conta (requer plano Pro).">
                      <div className="flex items-center gap-2">
                        {!isPro && <span className="text-[10px] text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">Pro</span>}
                        <Toggle checked={isPro && alertsEnabled} onChange={() => { if (!isPro) window.location.href = "/pricing"; }} />
                      </div>
                    </SettingRow>
                    <SettingRow label="Novos blocos BTC" desc="Animação quando um novo bloco BTC é confirmado.">
                      <Toggle checked={true} onChange={() => {}} />
                    </SettingRow>
                    <SettingRow label="Variações de preço > 5%" desc="Alerta quando um ativo do portfolio sobe ou desce mais de 5%.">
                      <Toggle checked={isPro} onChange={() => { if (!isPro) window.location.href = "/pricing"; }} />
                    </SettingRow>
                  </div>

                  {!isPro && (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">Alertas avançados com Pro</p>
                        <p className="text-xs text-slate-400">Email, webhooks e mais com o plano Pro.</p>
                      </div>
                      <a href="/pricing" className="shrink-0 rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">
                        Upgrade
                      </a>
                    </div>
                  )}

                  {/* ── Briefing Agendado ── */}
                  <div className={`rounded-xl border p-5 space-y-4 mt-2 ${isPro || isPremium ? "border-slate-700 bg-slate-900/40" : "border-orange-500/20 bg-orange-500/5"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">🦉 Briefing Diário por Email</p>
                          {!isPro && !isPremium && <span className="text-[10px] border border-orange-500/40 text-orange-400 rounded-full px-2 py-0.5">Pro</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">Recebe análise de mercado gerada por IA todos os dias à hora escolhida.</p>
                      </div>
                      {isPro || isPremium ? (
                        <Toggle checked={briefingEnabled} onChange={setBriefingEnabled} />
                      ) : (
                        <a href="/pricing" className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">Upgrade →</a>
                      )}
                    </div>

                    {(isPro || isPremium) && briefingEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-800">
                        {/* Hora */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400">Hora de envio (UTC)</p>
                          <select
                            value={briefingHour}
                            onChange={(e) => setBriefingHour(Number(e.target.value))}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-orange-500"
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i).padStart(2, "0")}:00 UTC</option>
                            ))}
                          </select>
                        </div>
                        {/* Modo */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-400">Tipo de análise</p>
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
                                {m === "crypto" ? "Cripto" : m === "tradicional" ? "Tradicional" : "Ambos"}
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
                        const { data: sessionData } = await supabase.auth.getSession();
                        const token = sessionData.session?.access_token ?? "";
                        await fetch("/api/news-briefing-schedule", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ enabled: briefingEnabled, hour_utc: briefingHour, mode: briefingMode }),
                        });
                        setBriefingSaving(false);
                        setBriefingSaved(true);
                        setTimeout(() => setBriefingSaved(false), 3000);
                      }}
                      className="w-full rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition"
                    >
                      {briefingSaving ? "A guardar…" : briefingSaved ? "✓ Guardado!" : "Guardar Agendamento"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Privacidade ── */}
              {section === "privacy" && (
                <div className="space-y-6">
                  <h2 className="text-base font-bold text-white">Privacidade & Segurança</h2>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 divide-y divide-slate-800/60">
                    <SettingRow label="Ocultar saldos" desc="Substitui todos os valores monetários por ••••">
                      <Toggle checked={hideBalances} onChange={v => setSetting("hideBalances", v)} />
                    </SettingRow>
                    <SettingRow label="Acesso só-leitura" desc="As carteiras são ligadas em modo leitura — nunca pedimos chaves privadas.">
                      <span className="text-xs text-emerald-400 font-semibold">✓ Sempre ativo</span>
                    </SettingRow>
                    <SettingRow label="Dados armazenados" desc="Snapshots e preferências guardados de forma segura na Supabase.">
                      <span className="text-xs text-slate-400">Supabase</span>
                    </SettingRow>
                    <SettingRow label="Exportar dados" desc="Descarrega todos os teus dados em CSV.">
                      <a href="/portfolio" className="text-xs text-orange-400 hover:text-orange-300 transition">
                        Exportar →
                      </a>
                    </SettingRow>
                  </div>

                  {/* Danger zone */}
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
                    <p className="text-sm font-semibold text-rose-400">Zona de perigo</p>
                    <SettingRow label="Repor definições" desc="Volta a todas as definições para os valores padrão.">
                      {resetConfirm ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { resetSettings(); setResetConfirm(false); }}
                            className="text-xs text-rose-400 hover:text-rose-300 transition font-semibold">Confirmar</button>
                          <button type="button" onClick={() => setResetConfirm(false)}
                            className="text-xs text-slate-500 hover:text-white transition">Cancelar</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setResetConfirm(true)}
                          className="text-xs border border-rose-500/30 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 transition">
                          Repor
                        </button>
                      )}
                    </SettingRow>
                    <SettingRow label="Terminar sessão em todos os dispositivos" desc="Invalida todos os tokens de sessão ativos.">
                      <button type="button" onClick={handleLogout}
                        className="text-xs border border-rose-500/30 text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-500/10 transition">
                        Sair de tudo
                      </button>
                    </SettingRow>
                  </div>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
    </AppShell>
  );
}
