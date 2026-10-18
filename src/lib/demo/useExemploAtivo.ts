"use client";

// A conta ativa está em modo de exemplo? (reage a carregar/tirar o exemplo e a trocar de conta)
import { useEffect, useState } from "react";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import { EVENTO_EXEMPLO, exemploAtivo } from "@/lib/demo/exemplo";

export function useExemploAtivo(): boolean {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const ler = () => setAtivo(exemploAtivo());
    ler();
    window.addEventListener(EVENTO_EXEMPLO, ler);
    window.addEventListener(ACCOUNTS_EVENT, ler);
    window.addEventListener("storage", ler);
    return () => { window.removeEventListener(EVENTO_EXEMPLO, ler); window.removeEventListener(ACCOUNTS_EVENT, ler); window.removeEventListener("storage", ler); };
  }, []);
  return ativo;
}
