"use client";

// Painel admin: beta testers ativos + validade. Acesso restrito (ADMIN_EMAILS).
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Tester = { email: string; plan: "pro" | "premium"; expiresAt: string | null; daysLeft: number | null };

export default function AdminBetaPage() {
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [count, setCount] = useState(0);
  const [testers, setTesters] = useState<Tester[]>([]);

  useEffect(() => {
    fetch("/api/admin/beta-testers")
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setState("denied"); return; }
        if (!r.ok) { setState("error"); return; }
        const j = (await r.json()) as { count: number; testers: Tester[] };
        setCount(j.count);
        setTesters(j.testers);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, []);

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—");

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-2xl font-bold text-white">Beta testers</h1>

          {state === "loading" && <p className="mt-6 text-sm text-slate-500">A carregar…</p>}
          {state === "denied" && (
            <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
              Sem acesso. Esta página é só para administradores (define o teu email em <code className="text-orange-300">ADMIN_EMAILS</code> na Vercel).
            </p>
          )}
          {state === "error" && <p className="mt-6 text-sm text-rose-400">Erro a carregar. Tenta novamente.</p>}

          {state === "ok" && (
            <>
              <div className="mt-6 flex items-center gap-4">
                <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-5 py-4">
                  <p className="text-3xl font-bold text-orange-300">{count}</p>
                  <p className="text-xs text-slate-400">testers ativos</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
                  <p className="text-3xl font-bold text-white">{testers.filter((t) => t.plan === "premium").length}</p>
                  <p className="text-xs text-slate-400">Premium</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4">
                  <p className="text-3xl font-bold text-white">{testers.filter((t) => t.plan === "pro").length}</p>
                  <p className="text-xs text-slate-400">Pro</p>
                </div>
              </div>

              {testers.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">Ainda não há testers ativos. Atribui um plano (source=&apos;manual&apos;) no Supabase.</p>
              ) : (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Plano</th>
                        <th className="px-4 py-3">Expira</th>
                        <th className="px-4 py-3">Dias restantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testers.map((tst, i) => (
                        <tr key={i} className="border-t border-slate-800/60">
                          <td className="px-4 py-3 text-slate-200">{tst.email || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tst.plan === "premium" ? "bg-violet-500/15 text-violet-300" : "bg-orange-500/15 text-orange-300"}`}>
                              {tst.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{fmt(tst.expiresAt)}</td>
                          <td className={`px-4 py-3 font-medium ${tst.daysLeft != null && tst.daysLeft <= 3 ? "text-rose-400" : "text-slate-300"}`}>
                            {tst.daysLeft != null ? `${tst.daysLeft} dias` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
