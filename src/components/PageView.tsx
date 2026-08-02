"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Regista uma visualizacao de pagina do lado do CLIENTE (estilo Google Analytics
// / Plausible): so paginas realmente carregadas num browser disparam isto, por
// isso bots que fazem pedidos 404 sem executar JS nao inflam as estatisticas.
// Zero manutencao - qualquer pagina nova e contada automaticamente.
export default function PageView() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api")) return;
    try {
      const body = JSON.stringify({ path: pathname });
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", blob);
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* nunca deixar o tracking quebrar a pagina */
    }
  }, [pathname]);

  return null;
}
