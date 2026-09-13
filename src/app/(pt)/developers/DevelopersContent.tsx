"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { createClient } from "@/lib/supabase/client";
import { API_BASE, API_ENDPOINTS, API_LIMITS, MCP_TOOLS, type ApiEndpoint } from "@/lib/api/catalog";

const BASE = API_BASE;
const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";

type Lang = "curl" | "js" | "python";
const LANGS: Array<{ id: Lang; label: string }> = [{ id: "curl", label: "curl" }, { id: "js", label: "JavaScript" }, { id: "python", label: "Python" }];
type Endpoint = ApiEndpoint;
const ENDPOINTS = API_ENDPOINTS;

function buildExample(e: Endpoint, lang: Lang): string {
  const qs = e.query ? "?" + new URLSearchParams(e.query).toString() : "";
  const url = `${BASE}${e.path}${qs}`;
  const auth = e.auth;
  if (lang === "curl") {
    if (e.method === "POST") return `curl -X POST ${BASE}${e.path} \\\n  -H "Authorization: Bearer $CFA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(e.body)}'`;
    if (e.query?.watchlist) return `curl -G ${BASE}${e.path} \\\n  -H "Authorization: Bearer $CFA_KEY" \\\n  --data-urlencode 'watchlist=${e.query.watchlist}'`;
    return `curl "${url}"${auth ? ' \\\n  -H "Authorization: Bearer $CFA_KEY"' : ""}`;
  }
  if (lang === "js") {
    const headers = auth ? `headers: { Authorization: \`Bearer \${process.env.CFA_KEY}\`${e.method === "POST" ? ', "Content-Type": "application/json"' : ""} }` : "";
    if (e.method === "POST") return `const res = await fetch("${BASE}${e.path}", {\n  method: "POST",\n  ${headers},\n  body: JSON.stringify(${JSON.stringify(e.body)}),\n});\nconst data = await res.json();`;
    if (e.query?.watchlist) return `const url = new URL("${BASE}${e.path}");\nurl.searchParams.set("watchlist", JSON.stringify([{ address: "0x…", chain: "eth", label: "Baleia" }]));\nconst res = await fetch(url, { ${headers} });\nconst data = await res.json();`;
    return `const res = await fetch("${url}"${auth ? `, { ${headers} }` : ""});\nconst data = await res.json();`;
  }
  // python
  const hdr = auth ? `headers = {"Authorization": f"Bearer {os.environ['CFA_KEY']}"}\n` : "";
  if (e.method === "POST") return `import os, requests\n\n${hdr}r = requests.post("${BASE}${e.path}", headers=headers, json=${JSON.stringify(e.body)})\nprint(r.json())`;
  if (e.query?.watchlist) return `import os, json, requests\n\n${hdr}params = {"watchlist": json.dumps([{"address": "0x…", "chain": "eth", "label": "Baleia"}])}\nr = requests.get("${BASE}${e.path}", headers=headers, params=params)\nprint(r.json())`;
  const params = e.query ? `, params=${JSON.stringify(e.query)}` : "";
  return `import os, requests\n\n${hdr}r = requests.get("${BASE}${e.path}"${auth ? ", headers=headers" : ""}${params})\nprint(r.json())`;
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* ignore */ } }}
      className="shrink-0 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-400 transition hover:text-white"
      aria-label={label}
    >
      {ok ? done : label}
    </button>
  );
}

function Code({ children, copyLabel, copyDone }: { children: string; copyLabel: string; copyDone: string }) {
  // O botão vive numa barra ACIMA do código: em ecrãs estreitos o <pre> faz
  // scroll horizontal e um botão sobreposto tapava o comando.
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80">
      <div className="flex items-center justify-end border-b border-slate-800/70 px-2 py-1">
        <CopyButton text={children} label={copyLabel} done={copyDone} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-slate-300">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Method({ children }: { children: string }) {
  return <span className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${children === "POST" ? "bg-sky-500/10 text-sky-300" : "bg-emerald-500/10 text-emerald-400"}`}>{children}</span>;
}

export default function DevelopersContent() {
  const { t } = useLanguage();
  const [lang, setLang] = useState<Lang>("curl");
  const [plan, setPlan] = useState<"unknown" | "anon" | "premium" | "other">("unknown");

  useEffect(() => {
    try { const saved = localStorage.getItem("dev-lang") as Lang | null; if (saved && LANGS.some(l => l.id === saved)) setLang(saved); } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (!user) { if (!cancelled) setPlan("anon"); return; }
        const res = await fetch("/api/subscription");
        if (!res.ok) return;
        const json = await res.json() as { plan?: string };
        if (!cancelled) setPlan(json.plan === "premium" ? "premium" : "other");
      } catch { /* fica unknown */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const pickLang = (l: Lang) => { setLang(l); try { localStorage.setItem("dev-lang", l); } catch { /* ignore */ } };
  const copyLabel = t("dev_copy"); const copyDone = t("dev_copied");
  const upgradeHref = paymentsFrozen ? "/beta" : "/pricing";

  const TOC: Array<{ id: string; key: TranslationKey }> = [
    { id: "auth", key: "dev_sec_auth" }, { id: "rest", key: "dev_sec_rest" }, { id: "mcp", key: "dev_sec_mcp" },
    { id: "errors", key: "dev_sec_errors" }, { id: "security", key: "dev_sec_security" },
  ];

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto w-full max-w-5xl px-6 py-16 lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
          {/* TOC */}
          <nav className="hidden lg:block" aria-label={t("dev_toc")}>
            <div className="sticky top-24 space-y-1 text-sm">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">{t("dev_toc")}</p>
              {TOC.map(s => <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-900 hover:text-white">{t(s.key)}</a>)}
              <p className="mt-4 mb-1 text-[10px] uppercase tracking-wider text-slate-500">Endpoints</p>
              {ENDPOINTS.map(e => <a key={e.id} href={`#ep-${e.id}`} className="block truncate rounded-lg px-2 py-0.5 font-mono text-[11px] text-slate-500 hover:text-white">{e.path.replace("/api/v1", "") || "/"}</a>)}
            </div>
          </nav>

          <div className="min-w-0">
            <Link href="/" className="text-sm text-orange-300/90 transition hover:text-orange-200">← {t("dev_back")}</Link>

            <h1 className="mt-6 text-3xl font-bold text-white md:text-4xl">API & MCP</h1>
            <p className="mt-3 text-slate-400">{t("dev_intro")}</p>

            {/* Plan-aware banner */}
            {plan === "premium" ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-5 py-3 text-sm text-emerald-100">
                <span>✅ {t("dev_banner_premium")}</span>
                <Link href="/account?section=api" className="rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400">🔑 {t("dev_manage_keys")}</Link>
              </div>
            ) : plan === "unknown" ? null : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-5 py-3 text-sm text-violet-100">
                <span>💎 {paymentsFrozen ? t("dev_banner_beta") : t("dev_banner_premium_needed")}</span>
                <Link href={plan === "anon" && !paymentsFrozen ? "/login" : upgradeHref} className="rounded-xl bg-violet-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-violet-400">
                  {paymentsFrozen ? `🧪 ${t("dev_beta_cta")} →` : `${t("gz_upgrade")} →`}
                </Link>
              </div>
            )}

            {/* Autenticação */}
            <section id="auth" className="mt-12 scroll-mt-24">
              <h2 className="text-lg font-bold text-white">{t("dev_sec_auth")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {t("dev_auth_p1")} <Link href="/account?section=api" className="text-orange-300 hover:text-orange-200">{t("dev_auth_link")}</Link> {t("dev_auth_p2")}
              </p>
              <Code copyLabel={copyLabel} copyDone={copyDone}>{`Authorization: Bearer cfa_live_…`}</Code>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-400 marker:text-orange-400/70">
                <li>{t("dev_auth_base")} <code className="text-slate-300">{BASE}/api/v1</code></li>
                <li>{t("dev_auth_format")} <code className="text-slate-300">cfa_live_</code> + 40 hex · {API_LIMITS.perMinute}/min</li>
                <li>{t("dev_auth_max_keys")}</li>
                <li>{t("dev_auth_cors")}</li>
              </ul>
            </section>

            {/* Endpoints */}
            <section id="rest" className="mt-12 scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-white">{t("dev_sec_rest")}</h2>
                <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1" role="tablist" aria-label={t("dev_lang")}>
                  {LANGS.map(l => (
                    <button key={l.id} type="button" role="tab" aria-selected={lang === l.id} onClick={() => pickLang(l.id)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${lang === l.id ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{t("dev_env_hint")} <code className="text-slate-400">CFA_KEY</code>.</p>
              <div className="mt-4 space-y-8">
                {ENDPOINTS.map((e) => (
                  <div key={e.id} id={`ep-${e.id}`} className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Method>{e.method}</Method>
                      <code className="text-sm font-semibold text-white">{e.path}</code>
                      {!e.auth && <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{t("dev_no_key")}</span>}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(e.descKey)}</p>
                    {e.query && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {t("dev_params")}: {Object.keys(e.query).map(k => <code key={k} className="mr-1 rounded bg-slate-800 px-1 text-slate-300">{k}</code>)}
                      </p>
                    )}
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("dev_example")}</p>
                    <Code copyLabel={copyLabel} copyDone={copyDone}>{buildExample(e, lang)}</Code>
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("dev_response")}</p>
                    <Code copyLabel={copyLabel} copyDone={copyDone}>{e.response}</Code>
                    {e.errors && (
                      <p className="mt-3 text-[11px] text-slate-500">
                        {t("dev_specific_errors")}:{" "}
                        <span className="inline-flex flex-wrap gap-1 align-middle">
                          {e.errors.map(x => <code key={x} className="rounded border border-slate-700/70 bg-slate-800/60 px-1.5 py-0.5 text-slate-300">{x}</code>)}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* MCP */}
            <section id="mcp" className="mt-12 scroll-mt-24">
              <h2 className="text-lg font-bold text-white">{t("dev_sec_mcp")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {t("dev_mcp_p1")} <code className="text-slate-300">{BASE}/api/mcp</code> {t("dev_mcp_p2")}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-300 marker:text-orange-400/70">
                {MCP_TOOLS.map(tool => (
                  <li key={tool.name}><code className="text-slate-400">{tool.name}</code> — {t(tool.key)}{tool.arg && <span className="text-slate-500"> ({t("dev_arg")} <code>{tool.arg}</code>)</span>}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-amber-200/90">⚠️ {t("dev_mcp_401")}</p>

              <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Claude Code / Claude Desktop</p>
              <Code copyLabel={copyLabel} copyDone={copyDone}>{`claude mcp add --transport http chainfolioai ${BASE}/api/mcp \\\n  --header "Authorization: Bearer cfa_live_…"`}</Code>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cursor (~/.cursor/mcp.json)</p>
              <Code copyLabel={copyLabel} copyDone={copyDone}>{`{\n  "mcpServers": {\n    "chainfolioai": {\n      "url": "${BASE}/api/mcp",\n      "headers": { "Authorization": "Bearer cfa_live_…" }\n    }\n  }\n}`}</Code>
            </section>

            {/* Erros + limites */}
            <section id="errors" className="mt-12 scroll-mt-24">
              <h2 className="text-lg font-bold text-white">{t("dev_sec_errors")}</h2>
              <p className="mt-2 text-sm text-slate-400">{t("dev_errors_format")} <code className="text-slate-300">{`{ "error": "code", "message": "…" }`}</code></p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-3 py-2 text-left">HTTP</th><th className="px-3 py-2 text-left">error</th><th className="px-3 py-2 text-left">{t("dev_when")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {([
                      ["400", "missing_* / invalid_* / too_many", t("dev_err_400")],
                      ["401", "invalid_key", t("dev_err_401")],
                      ["403", "premium_required", t("dev_err_403")],
                      ["404", "not_found", t("dev_err_404")],
                      ["405", "—", t("dev_err_405")],
                      ["429", "rate_limited", t("dev_err_429")],
                      ["429", "chat_limit", t("dev_err_429_chat")],
                      ["503", "service_unavailable / ai_unavailable", t("dev_err_503")],
                    ] as Array<[string, string, string]>).map(([code, err, when]) => (
                      <tr key={code + err}><td className="px-3 py-2 font-mono text-rose-300">{code}</td><td className="px-3 py-2 font-mono text-slate-400">{err}</td><td className="px-3 py-2">{when}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">{t("dev_versioning")}</p>
            </section>

            {/* Segurança */}
            <section id="security" className="mt-12 scroll-mt-24">
              <h2 className="text-lg font-bold text-white">{t("dev_sec_security")}</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-400 marker:text-orange-400/70">
                <li>{t("dev_sec_1")} <code className="text-slate-300">wallet_8815840fa2</code>. {t("dev_sec_1b")}</li>
                <li>{t("dev_sec_2")} <code className="text-slate-300">Cache-Control: no-store</code>.</li>
                <li>{t("dev_sec_3")}</li>
                <li>{t("dev_sec_4")}</li>
                <li>{t("dev_sec_5")}</li>
              </ul>
            </section>

            <div className="mt-14 border-t border-slate-800 pt-6">
              <Link href="/account?section=api" className="text-sm font-semibold text-orange-300 hover:text-orange-200">{t("dev_manage_keys")} →</Link>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
