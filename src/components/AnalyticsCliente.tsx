"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Analytics } from "@vercel/analytics/react";
import { eInterno, marcarInterno } from "@/lib/analytics/interno";

// Vercel Analytics sem as visitas internas (ver src/lib/analytics/interno.ts),
// e o sítio onde ?interno=1 / ?interno=0 e as páginas /admin ligam a marca.
function MarcaInterna() {
  const params = useSearchParams();
  const caminho = usePathname();
  useEffect(() => {
    const pedido = params.get("interno");
    if (pedido === "1") marcarInterno(true);
    else if (pedido === "0") marcarInterno(false);
    else if (caminho?.startsWith("/admin")) marcarInterno(true);
  }, [params, caminho]);
  return null;
}

export default function AnalyticsCliente() {
  return (
    <>
      {/* useSearchParams obriga a Suspense para nao tornar a pagina toda dinamica. */}
      <Suspense fallback={null}><MarcaInterna /></Suspense>
      <Analytics beforeSend={(e) => (eInterno(document.cookie) ? null : e)} />
    </>
  );
}
