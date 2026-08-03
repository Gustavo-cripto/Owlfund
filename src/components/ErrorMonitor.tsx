"use client";

// Monitorização de erros do cliente: apanha erros de JS e promessas rejeitadas
// não tratadas e envia-os para /api/client-error (logs do servidor). Com
// throttling + dedupe para não fazer spam, e uma lista de ruído a ignorar.
import { useEffect } from "react";

const IGNORE = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /^Script error\.?$/i, // erros de scripts cross-origin sem detalhe
];

const seen = new Map<string, number>();
let sent = 0;
let windowStart = Date.now();

function shouldSend(key: string): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    sent = 0;
    seen.clear();
  }
  if (sent >= 10) return false; // máx 10/min por cliente
  const last = seen.get(key) ?? 0;
  if (now - last < 10_000) return false; // mesmo erro no máx 1×/10s
  seen.set(key, now);
  sent += 1;
  return true;
}

function report(kind: string, message: string, stack?: string) {
  if (!message || IGNORE.some((r) => r.test(message))) return;
  const key = (message + (stack ?? "")).slice(0, 200);
  if (!shouldSend(key)) return;
  try {
    const body = JSON.stringify({
      kind,
      message: String(message).slice(0, 500),
      stack: stack ? String(stack).slice(0, 2000) : undefined,
      url: typeof location !== "undefined" ? location.href : undefined,
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* nunca deixar a monitorização partir a app */
  }
}

export default function ErrorMonitor() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => report("error", e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | undefined;
      report("unhandledrejection", r?.message ?? String(e.reason), r?.stack);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
