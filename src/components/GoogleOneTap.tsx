"use client";

// Google One Tap: o cartão que aparece no canto com a conta Google já
// escolhida — um clique e a pessoa entra, sem ir à página de login. Só na
// página de login, e só sem sessão: em mais lado nenhum, para não ser um
// pop-up a chatear quem só veio ler.
//
// Precisa do NEXT_PUBLIC_GOOGLE_CLIENT_ID (o mesmo client ID que o Supabase
// usa no fornecedor Google; não é segredo). Sem ele, este componente não
// desenha nada.
import { useEffect } from "react";

import { getSupabase } from "@/lib/supabase/lazy";
import { contaSemCarteiras } from "@/lib/auth/contaNova";

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: Record<string, unknown>) => void; prompt: () => void; cancel: () => void } } };
  }
}

// `next` e o destino ja saneado; `pediuDestino` diz se alguem o pediu (?next=).
// Sem destino pedido, uma conta sem nada guardado vai a Carteiras — a mesma
// regra do callback e do /api/auth/confirm (ver src/lib/auth/contaNova.ts).
export default function GoogleOneTap({ next, pediuDestino = false }: { next: string; pediuDestino?: boolean }) {
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let cancelado = false;
    (async () => {
      const supabase = await getSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session || cancelado) return;
      if (!document.getElementById("gsi-client")) {
        const s = document.createElement("script");
        s.id = "gsi-client"; s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
        document.head.appendChild(s);
        await new Promise<void>((r) => { s.onload = () => r(); s.onerror = () => r(); });
      }
      if (cancelado || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp: { credential: string }) => {
          const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: resp.credential });
          if (error) return;
          let destino = next;
          const uid = data.user?.id ?? "";
          if (!pediuDestino && uid && (await contaSemCarteiras(supabase, uid))) destino = "/wallets";
          window.location.href = destino;
        },
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.prompt();
    })();
    return () => { cancelado = true; try { window.google?.accounts.id.cancel(); } catch { /* ignore */ } };
  }, [next, pediuDestino]);
  return null;
}
