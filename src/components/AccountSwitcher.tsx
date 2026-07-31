"use client";

// Seletor de contas (multi-portfólio). Gated a Pro/Premium.
// - Free: 1 conta · Pro: 3 · Premium: 10.
// - Trocar de conta (ou "Todas") recarrega a página, para que os load*/save*
//   apanhem os dados da conta ativa sem refactor das páginas grandes.

import { useEffect, useRef, useState } from "react";
import {
  ALL_ACCOUNTS_ID,
  createAccount,
  deleteAccount,
  ensureAccounts,
  getActiveAccountId,
  listAccounts,
  renameAccount,
  setActiveAccountId,
  type Account,
} from "@/lib/portfolios/accounts";

type Plan = "free" | "pro" | "premium";
const MAX_BY_PLAN: Record<Plan, number> = { free: 1, pro: 3, premium: 10 };

export default function AccountSwitcher() {
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<Plan>("free");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureAccounts();
    setAccounts(listAccounts());
    setActiveId(getActiveAccountId());
    setReady(true);
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { plan?: Plan } | null) => {
        if (j?.plan) setPlan(j.plan);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!ready) return null;

  const max = MAX_BY_PLAN[plan];
  const isAll = activeId === ALL_ACCOUNTS_ID;
  // Mostra o seletor a quem pode ter várias contas (Pro/Premium) OU a quem já
  // tem mais do que uma (ex.: fez downgrade) — para não estranhar dados.
  const shouldShow = plan === "pro" || plan === "premium" || accounts.length > 1;
  if (!shouldShow) return null;

  const canCreate = accounts.length < max;
  const activeName = isAll
    ? "Todas as contas"
    : accounts.find((a) => a.id === activeId)?.name ?? "Conta";

  const switchTo = (id: string) => {
    setActiveAccountId(id);
    window.location.reload();
  };

  const onNew = () => {
    if (!canCreate) return;
    createAccount(); // auto-nomeia "Conta N" e fica ativa
    window.location.reload();
  };

  const onRename = () => {
    if (isAll) return;
    const current = accounts.find((a) => a.id === activeId);
    const name = window.prompt("Novo nome da conta:", current?.name ?? "");
    if (name && name.trim()) {
      renameAccount(activeId, name.trim());
      setAccounts(listAccounts());
    }
  };

  const onDelete = () => {
    if (isAll || accounts.length <= 1) return;
    const current = accounts.find((a) => a.id === activeId);
    if (!window.confirm(`Apagar a conta "${current?.name}" e os seus dados? Esta ação não pode ser desfeita.`)) return;
    deleteAccount(activeId);
    window.location.reload();
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-orange-500/50 hover:bg-slate-800/70"
        title="Conta / portfólio"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400 shrink-0">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span className="max-w-[140px] truncate">{activeName}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl shadow-black/60">
          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Contas · {accounts.length}/{max}
          </p>

          <button
            type="button"
            onClick={() => switchTo(ALL_ACCOUNTS_ID)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${isAll ? "bg-orange-500/15 text-orange-300" : "text-slate-300 hover:bg-white/5"}`}
          >
            <span className="font-medium">Todas as contas</span>
            {isAll && <span className="text-orange-400">✓</span>}
          </button>

          <div className="my-1 border-t border-white/[0.06]" />

          <div className="max-h-56 overflow-y-auto">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => switchTo(a.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${a.id === activeId ? "bg-orange-500/15 text-orange-300" : "text-slate-300 hover:bg-white/5"}`}
              >
                <span className="truncate">{a.name}</span>
                {a.id === activeId && <span className="shrink-0 text-orange-400">✓</span>}
              </button>
            ))}
          </div>

          <div className="my-1 border-t border-white/[0.06]" />

          <button
            type="button"
            onClick={onNew}
            disabled={!canCreate}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-orange-400">＋</span> Nova conta
          </button>
          {!canCreate && (
            <p className="px-3 py-1 text-[11px] text-slate-500">
              {plan === "premium" ? "Limite do plano Premium (10)." : (
                <>Limite do plano. <a href="/pricing" className="text-orange-400 hover:underline">Fazer upgrade</a> para mais.</>
              )}
            </p>
          )}

          {!isAll && (
            <button type="button" onClick={onRename} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5">
              <span className="text-slate-400">✎</span> Renomear atual
            </button>
          )}
          {!isAll && accounts.length > 1 && (
            <button type="button" onClick={onDelete} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-400 transition hover:bg-rose-500/10">
              <span>🗑</span> Apagar atual
            </button>
          )}

          {isAll && (
            <p className="px-3 py-2 text-[11px] leading-snug text-slate-500">
              Vista combinada (só leitura). Escolhe uma conta para adicionar/editar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
