"use client";

// Cloudflare Turnstile (anti-robô) nos formulários de autenticação. Desligado
// por omissão: só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY está definida.
// Para o Supabase exigir o token é preciso ativar "Captcha protection" (Turnstile,
// com a chave secreta) em Authentication → Attack Protection; a partir daí
// registo, entrada por palavra-passe, link mágico e recuperação só passam com
// `captchaToken`, e é isso que o hook abaixo acrescenta a cada chamada.
//
// O token é de uso único: depois de cada tentativa chama-se `renovar()`, que
// volta a montar o widget.

import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
export const turnstileAtivo = (): boolean => TURNSTILE_SITE_KEY.length > 0;

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let aCarregar: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!aCarregar) {
    aCarregar = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { aCarregar = null; reject(new Error("turnstile: script não carregou")); };
      document.head.appendChild(s);
    });
  }
  return aCarregar;
}

export default function Turnstile({ onToken, lang, className }: { onToken: (token: string | null) => void; lang?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!turnstileAtivo() || !ref.current) return;
    let id: string | null = null;
    let vivo = true;
    carregarScript().then(() => {
      if (!vivo || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: lang ?? "auto",
        theme: "dark",
        size: "flexible",
        callback: (token: string) => cb.current(token),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => { vivo = false; try { if (id && window.turnstile) window.turnstile.remove(id); } catch { /* já removido */ } };
  }, [lang]);
  if (!turnstileAtivo()) return null;
  return <div ref={ref} className={className} />;
}

/**
 * Estado do captcha para um formulário: `widget` vai no JSX, `captcha` espalha-se
 * nas `options` da chamada ao Supabase, `renovar()` depois de cada tentativa.
 * Com o Turnstile desligado, `ativo` é falso e tudo o resto é inerte.
 */
export function useTurnstile(lang?: string) {
  const [token, setToken] = useState<string | null>(null);
  const [vez, setVez] = useState(0);
  const renovar = useCallback(() => { setToken(null); setVez((v) => v + 1); }, []);
  const ativo = turnstileAtivo();
  const widget = ativo ? <Turnstile key={vez} onToken={setToken} lang={lang} className="mt-3" /> : null;
  const captcha: { captchaToken?: string } = token ? { captchaToken: token } : {};
  return { ativo, token, widget, renovar, captcha };
}
