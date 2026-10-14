"use client";

import { useSearchParams } from "next/navigation";
import LoginForm from "./login-form";

// Os parâmetros do endereço (?mode=, ?next=, ?email=, ?error=) são lidos no
// browser: assim a página de entrada é estática e sai da cache da Vercel. Lida no
// servidor, cada visita gerava a página de novo e, com pouco tráfego, quase todas
// apanhavam o arranque a frio (~1,2 s em vez de ~0,2 s — 14 out 2026).
export default function LoginComParametros() {
  const p = useSearchParams();
  return (
    <LoginForm
      nextParam={p.get("next")}
      modeParam={p.get("mode")}
      emailParam={p.get("email")}
      errorParam={p.get("error")}
    />
  );
}
