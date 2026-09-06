"use client";

// Painel admin: beta testers ativos + validade. Acesso restrito (ADMIN_EMAILS).
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useConfirm } from "@/components/ConfirmDialog";

type Tester = { email: string; plan: "pro" | "premium"; activatedAt?: string | null; expiresAt: string | null; daysLeft: number | null; lastSignInAt?: string | null; inactiveDays?: number | null; founder?: boolean };
type Pending = { email: string; name: string | null; note: string | null; createdAt: string };

export default function AdminBetaPage() {
  const askConfirm = useConfirm();
  const [founderMsg, setFounderMsg] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [count, setCount] = useState(0);
  const [testers, setTesters] = useState<Tester[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);

  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [founderBusy, setFounderBusy] = useState<string | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reconfigBot = async () => {
    if (tgBusy) return;
    setTgBusy(true);
    setTgMsg(null);
    try {
      const r = await fetch("/api/admin/telegram-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set" }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; bot?: string };
      if (!r.ok) { setTgMsg({ ok: false, text: j.error || "Falhou." }); return; }
      setTgMsg({ ok: true, text: `✅ Webhook registado no @${j.bot ?? "bot"}. Os botões de ativação voltam a funcionar.` });
    } catch {
      setTgMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setTgBusy(false);
    }
  };

  const removeBotWebhook = async () => {
    if (tgBusy) return;
    if (!(await askConfirm({ message: "Remover o webhook do bot? Os botões de ativação no Telegram deixam de funcionar até reconfigurares.", danger: true, okLabel: "Remover" }))) return;
    setTgBusy(true);
    setTgMsg(null);
    try {
      const r = await fetch("/api/admin/telegram-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; bot?: string };
      if (!r.ok) { setTgMsg({ ok: false, text: j.error || "Falhou." }); return; }
      setTgMsg({ ok: true, text: `🧹 Webhook removido do @${j.bot ?? "bot"} (o bot que está agora na Vercel).` });
    } catch {
      setTgMsg({ ok: false, text: "Erro de rede." });
    } finally {
      setTgBusy(false);
    }
  };

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

  // Marca/desmarca a reserva de preço de fundador de um tester.
  const toggleFounder = async (email: string, on: boolean) => {
    if (!on && !(await askConfirm({ message: `Remover a reserva de preço de fundador de ${email}?`, danger: true, okLabel: "Remover" }))) return;
    setFounderBusy(email);
    setFounderMsg(null);
    try {
      const res = await fetch("/api/admin/founder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, founder: on }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setFounderMsg(`❌ ${j.error ?? "Falhou."}`);
      else setTesters((prev) => prev.map((t) => (t.email === email ? { ...t, founder: on } : t)));
    } catch {
      setFounderMsg("❌ Erro de rede.");
    }
    setFounderBusy(null);
  };

  // Pré-preenche o email a partir do link da notificação (?email=...).
  useEffect(() => {
    try {
      const e = new URLSearchParams(window.location.search).get("email");
      if (e) setGrantEmail(e);
    } catch { /* ignore */ }
  }, []);

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
                <p className="mt-6 text-sm text-slate-500">Ainda não há testers ativos. Usa o formulário acima (colar email → Ativar Pro/Premium) ou aceita uma inscrição pendente.</p>
              ) : (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Plano</th>
                        <th className="px-4 py-3">Expira</th>
                        <th className="px-4 py-3">Dias restantes</th>
                        <th className="px-4 py-3">Último acesso</th>
                        <th className="px-4 py-3">Fundador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testers.map((tst, i) => (
                        <tr key={tst.email || i} className="border-t border-slate-800/60">
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
                          <td className={`px-4 py-3 ${tst.inactiveDays != null && tst.inactiveDays >= 14 ? "text-amber-400 font-medium" : "text-slate-400"}`}>
                            {tst.inactiveDays == null ? "—" : tst.inactiveDays === 0 ? "hoje" : `há ${tst.inactiveDays}d${tst.inactiveDays >= 14 ? " ⚠️" : ""}`}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleFounder(tst.email, !tst.founder)}
                              disabled={founderBusy === tst.email}
                              title={tst.founder ? "Remover reserva de fundador" : "Marcar como fundador (preço vitalício)"}
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold transition disabled:opacity-50 ${tst.founder ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" : "bg-slate-800 text-slate-500 hover:text-slate-300"}`}
                            >
                              {founderBusy === tst.email ? "…" : tst.founder ? "🏆 Sim" : "marcar"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {founderMsg && <p className="mt-2 text-xs text-rose-400">{founderMsg}</p>}

              {/* Reconfigurar o webhook do bot (usar depois de rodar o token). */}
              <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">Bot Telegram</p>
                <p className="mt-1 text-xs text-slate-500">Ambos os botões atuam sobre o bot cujo token está <b>agora</b> na Vercel. <b>Reconfigurar</b> = registar o webhook nesse bot. <b>Remover webhook</b> = tirar o webhook desse bot (usa antes de trocares para outro bot).</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={reconfigBot}
                    disabled={tgBusy}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-40"
                  >
                    {tgBusy ? "A processar…" : "Reconfigurar bot"}
                  </button>
                  <button
                    type="button"
                    onClick={removeBotWebhook}
                    disabled={tgBusy}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-40"
                  >
                    {tgBusy ? "A processar…" : "Remover webhook"}
                  </button>
                </div>
                {tgMsg && <p className={`mt-2 text-xs ${tgMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>{tgMsg.text}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
