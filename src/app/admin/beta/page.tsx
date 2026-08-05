"use client";

// Painel admin: beta testers ativos + validade. Acesso restrito (ADMIN_EMAILS).
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Tester = { email: string; plan: "pro" | "premium"; expiresAt: string | null; daysLeft: number | null };
type Pending = { email: string; name: string | null; note: string | null; createdAt: string };

export default function AdminBetaPage() {
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [count, setCount] = useState(0);
  const [testers, setTesters] = useState<Tester[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);

  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    fetch("/api/admin/beta-testers")
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setState("denied"); return; }
        if (!r.ok) { setState("error"); return; }
        const j = (await r.json()) as { count: number; testers: Tester[]; pending?: Pending[] };
        setCount(j.count);
        setTesters(j.testers);
        setPending(j.pending ?? []);
        setState("ok");
      })
      .catch(() => setState("error"));
  };

  useEffect(() => { load(); }, []);

  const grant = async (plan: "pro" | "premium", emailArg?: string) => {
    const email = (emailArg ?? grantEmail).trim();
    if (!email || granting) return;
    setGranting(true);
    setGrantMsg(null);
    try {
      const r = await fetch("/api/admin/grant-tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setGrantMsg({ ok: false, text: j.error || "Falhou." }); return; }
      setGrantMsg({ ok: true, text: `✅ ${email} ativado com ${plan === "premium" ? "Premium" : "Pro"} (60 dias). O tester deve recarregar a página.` });
      setGrantEmail("");
      load();
    } catch {
      setGrantMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setGranting(false);
    }
  };

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
              {/* Ativar um tester — cola o email da notificação e clica. Sem SQL. */}
              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Ativar tester (60 dias)</p>
                <p className="mt-1 text-xs text-slate-500">Cola o email da inscrição e escolhe o plano. O tester tem de já ter criado conta no site.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    placeholder="email@tester.com"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
                  />
                  <button
                    type="button"
                    onClick={() => grant("pro")}
                    disabled={granting || !grantEmail.trim()}
                    className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-40"
                  >
                    Ativar Pro
                  </button>
                  <button
                    type="button"
                    onClick={() => grant("premium")}
                    disabled={granting || !grantEmail.trim()}
                    className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
                  >
                    Ativar Premium
                  </button>
                </div>
                {granting && <p className="mt-2 text-xs text-slate-500">A ativar…</p>}
                {grantMsg && (
                  <p className={`mt-2 text-xs ${grantMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>{grantMsg.text}</p>
                )}
              </div>

              {/* Inscrições pendentes — aceita com um clique, sem copiar email. */}
              {pending.length > 0 && (
                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">Inscrições pendentes <span className="text-slate-500">({pending.length})</span></p>
                  <div className="mt-3 space-y-2">
                    {pending.map((p) => (
                      <div key={p.email} className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-200">{p.email}{p.name ? <span className="text-slate-500"> · {p.name}</span> : null}</p>
                          {p.note ? <p className="mt-0.5 truncate text-xs text-slate-500">{p.note}</p> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => grant("pro", p.email)} disabled={granting} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-40">Ativar Pro</button>
                          <button type="button" onClick={() => grant("premium", p.email)} disabled={granting} className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40">Ativar Premium</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
