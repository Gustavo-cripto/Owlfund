"use client";

// Barra de progresso no topo, ligada aos cliques de navegação.
//
// É a resposta imediata ao clique — o "ouvi-te" — antes de haver conteúdo. Sem
// ela, um clique numa página pesada parecia um botão partido. Arranca no
// clique em qualquer link interno (captura no documento, por isso não precisa
// de saber de nenhum componente) e termina quando o endereço muda. Um limite de
// tempo termina-a se a navegação morrer sem sair do sítio — a rede de
// segurança dos links já recarrega a página nesse caso.
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const LIMITE_MS = 12_000;

export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [ativa, setAtiva] = useState(false);
  const [fim, setFim] = useState(false);
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);

  const terminar = () => {
    if (limite.current) clearTimeout(limite.current);
    limite.current = null;
    setFim(true);
    setTimeout(() => { setAtiva(false); setFim(false); }, 250);
  };

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const a = (ev.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destino = `${url.pathname}${url.search}`;
      if (destino === `${window.location.pathname}${window.location.search}`) return;   // já cá estamos
      if (url.pathname === window.location.pathname && url.hash) return;                // âncora na mesma página
      setFim(false);
      setAtiva(true);
      if (limite.current) clearTimeout(limite.current);
      limite.current = setTimeout(terminar, LIMITE_MS);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // O endereço mudou: chegou.
  const chave = `${pathname}?${search?.toString() ?? ""}`;
  const anterior = useRef(chave);
  useEffect(() => {
    if (anterior.current !== chave) { anterior.current = chave; if (ativa) terminar(); }
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ativa) return null;
  return (
    <div aria-hidden className={`nav-progress ${fim ? "nav-progress--fim" : ""}`}>
      <div className="nav-progress__barra" />
    </div>
  );
}
