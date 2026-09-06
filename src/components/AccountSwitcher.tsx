"use client";

// Seletor de contas (multi-portefólio). Gated a Pro/Premium.
// - Free: 1 conta · Pro: 3 · Premium: 10.
// - Trocar de conta (ou "Todas") recarrega a página, para que os load*/save*
//   apanhem os dados da conta ativa sem refactor das páginas grandes.
// - Renomear/apagar é POR conta, diretamente na lista (input inline, sem prompt).

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog";

const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  ACCOUNTS_EVENT,
  ALL_ACCOUNTS_ID,
  claimLocalData,
  createAccount,
  deleteAccount,
  ensureAccounts,
  getActiveAccountId,
  listAccounts,
  renameAccount,
  setActiveAccountId,
  type Account,
} from "@/lib/portfolios/accounts";
import { pushWalletCloud } from "@/lib/portfolios/cloudSync";
import { createClient } from "@/lib/supabase/client";

type Plan = "free" | "pro" | "premium";
const MAX_BY_PLAN: Record<Plan, number> = { free: 1, pro: 3, premium: 10 };

export default function AccountSwitcher() {
  const { t } = useLanguage();
  const askConfirm = useConfirm();
  const [ready, setReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [plan, setPlan] = useState<Plan | "unknown">("unknown");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // O seletor só existe para utilizadores autenticados: as contas são dados
  // privados do dispositivo e não devem aparecer nas páginas públicas.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setIsLoggedIn(false);
        setReady(true);
        return;
      }
      // Se os dados locais forem de outro utilizador, são limpos aqui.
      claimLocalData(user.id);
      ensureAccounts();
      setAccounts(listAccounts());
      setActiveId(getActiveAccountId());
      setIsLoggedIn(true);
      setReady(true);
      fetch("/api/subscription")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { plan?: Plan } | null) => {
          if (mounted && j?.plan) setPlan(j.plan); // falha → fica "unknown" (não bloquear)
        })
        .catch(() => {});
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { init(); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Re-lê a lista quando o registo muda (ex.: contas fundidas da nuvem noutro
  // dispositivo), para o seletor refletir as novas contas sem reload manual.
  useEffect(() => {
    const refresh = () => {
      setAccounts(listAccounts());
      setActiveId(getActiveAccountId());
    };
    window.addEventListener(ACCOUNTS_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNTS_EVENT, refresh);
  }, []);

  if (!ready || !isLoggedIn) return null;

  const max = plan === "unknown" ? MAX_BY_PLAN.premium : MAX_BY_PLAN[plan];
  const isAll = activeId === ALL_ACCOUNTS_ID;
  // Mostramos sempre o seletor (paridade desktop/telemóvel). O limite do plano
  // é aplicado no botão "Nova conta" (desativado + CTA de upgrade no Free), não
  // escondendo a UI — antes ficava oculto no desktop quando só havia 1 conta.

  const canCreate = plan === "unknown" ? true : accounts.length < max;
  const activeName = isAll
    ? t("gz_all_accounts")
    : accounts.find((a) => a.id === activeId)?.name ?? t("gz_account");

  const switchTo = (id: string) => {
    setActiveAccountId(id);
    window.location.reload();
  };

  const onNew = () => {
    if (!canCreate) return;
    createAccount(); // auto-nomeia "Conta N" e fica ativa
    pushWalletCloud();
    window.location.reload();
  };

  const startEdit = (a: Account) => {
    setEditingId(a.id);
    setEditName(a.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };
  const saveEdit = () => {
    if (!editingId) return;
    const n = editName.trim();
    if (n) {
      renameAccount(editingId, n);
      setAccounts(listAccounts());
      pushWalletCloud();
    }
    cancelEdit();
  };

  const onDeleteRow = async (a: Account) => {
    if (accounts.length <= 1) return;
    if (!(await askConfirm({ message: t("acs_delete_confirm").replace("{name}", a.name), danger: true, okLabel: t("remove") }))) return;
    const wasActive = a.id === activeId;
    deleteAccount(a.id);
    pushWalletCloud();
    if (wasActive) {
      window.location.reload();
    } else {
      setAccounts(listAccounts());
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-orange-500/50 hover:bg-slate-800/70"
        title={t("acs_title")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-orange-400">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="max-w-[140px] truncate">{activeName}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/60">
          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t("acs_accounts")} · {accounts.length}/{plan === "unknown" ? "?" : max}
          </p>

          <button
            type="button"
            onClick={() => switchTo(ALL_ACCOUNTS_ID)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${isAll ? "bg-orange-500/15 text-orange-300" : "text-slate-300 hover:bg-white/5"}`}
          >
            <span className="font-medium">{t("gz_all_accounts")}</span>
            {isAll && <span className="text-orange-400">✓</span>}
          </button>

          <div className="my-1 border-t border-white/[0.06]" />

          <div className="max-h-64 overflow-y-auto">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-1 rounded-xl px-1.5 py-1 ${a.id === activeId ? "bg-orange-500/15" : "hover:bg-white/5"}`}
              >
                {editingId === a.id ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      maxLength={40}
                      className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-orange-500"
                    />
                    <button type="button" onClick={saveEdit} aria-label={t("save")} className="shrink-0 rounded-lg px-2 py-1 text-orange-400 hover:bg-white/5">✓</button>
                    <button type="button" onClick={cancelEdit} aria-label={t("cancel")} className="shrink-0 rounded-lg px-2 py-1 text-slate-500 hover:bg-white/5">✕</button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => switchTo(a.id)}
                      className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left text-sm ${a.id === activeId ? "font-medium text-orange-300" : "text-slate-300 hover:text-white"}`}
                    >
                      {a.name}
                    </button>
                    {a.id === activeId && <span className="shrink-0 text-sm text-orange-400">✓</span>}
                    <button type="button" onClick={() => startEdit(a)} aria-label={t("acs_rename")} title={t("acs_rename")} className="shrink-0 rounded-lg px-1.5 py-1 text-slate-500 transition hover:bg-white/5 hover:text-orange-300">✎</button>
                    {accounts.length > 1 && (
                      <button type="button" onClick={() => onDeleteRow(a)} aria-label={t("remove")} title={t("remove")} className="shrink-0 rounded-lg px-1.5 py-1 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400">🗑</button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="my-1 border-t border-white/[0.06]" />

          <button
            type="button"
            onClick={onNew}
            disabled={!canCreate}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-orange-400">＋</span> {t("acs_new")}
          </button>
          {!canCreate && (
            <p className="px-3 py-1 text-[11px] text-slate-500">
              {plan === "premium" ? t("acs_limit_premium") : (
                <>{t("acs_limit_plan")} <a href={paymentsFrozen ? "/beta" : "/pricing"} className="text-orange-400 hover:underline">{paymentsFrozen ? t("dash_beta_cta_short") : t("acs_upgrade")}</a></>
              )}
            </p>
          )}

          {isAll && (
            <p className="px-3 py-2 text-[11px] leading-snug text-slate-500">{t("acs_all_hint")}</p>
          )}
          {!isAll && (
            <p className="px-3 py-1.5 text-[11px] leading-snug text-slate-500">{t("acs_row_hint")}</p>
          )}
        </div>
      )}
    </div>
  );
}
