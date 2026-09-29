"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Analytics } from "@vercel/analytics/react";
import { eInterno, marcarInterno } from "@/lib/analytics/interno";

// Vercel Analytics sem as visitas internas (ver src/lib/analytics/interno.ts),
// e o sítio onde ?interno=1 / ?interno=0 ligam a marca. As páginas /admin
// ligam-na elas próprias, DEPOIS de o servidor confirmar que é admin — pelo
// caminho, qualquer pessoa com sessão que abrisse /admin ficava fora das contas.
function MarcaInterna() {
  const params = useSearchParams();
  useEffect(() => {
    const pedido = params.get("interno");
    if (pedido === "1") marcarInterno(true);
    else if (pedido === "0") marcarInterno(false);
  }, [params]);
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
