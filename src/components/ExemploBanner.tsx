"use client";

// Faixa do modo de exemplo (ver src/lib/demo/exemplo.ts): aparece nas páginas
// da conta que mostram as carteiras enquanto a conta ativa tiver o exemplo. Na
// inicial e nas outras páginas públicas não (14 out 2026: dizia "estás a ver
// dados de exemplo" por cima da página inicial, onde não há exemplo nenhum).

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import { EVENTO_EXEMPLO, exemploAtivo, removerExemplo } from "@/lib/demo/exemplo";

const PAGINAS_DA_CONTA = ["/wallets", "/portfolio", "/dashboard", "/historico", "/gestor", "/fiscalidade", "/fire"];
// O campo "cola o teu endereço" do topo das Carteiras (o caminho mais curto,
// sobretudo no telemóvel); sem ele, os cartões das redes.
const CAMPO = "adicionar-endereco";
const ANCORA = "chain-cards";

export default function ExemploBanner() {
  const { t } = useLanguage();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const ler = () => setAtivo(exemploAtivo());
    ler();
    window.addEventListener(EVENTO_EXEMPLO, ler);
    window.addEventListener(ACCOUNTS_EVENT, ler);
    window.addEventListener("storage", ler);
    return () => { window.removeEventListener(EVENTO_EXEMPLO, ler); window.removeEventListener(ACCOUNTS_EVENT, ler); window.removeEventListener("storage", ler); };
  }, []);
  if (!ativo || !PAGINAS_DA_CONTA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  // Em Carteiras o link para /wallets não fazia nada (já se estava lá): desce
  // até aos cartões das redes, onde se cola o endereço ou se liga a extensão.
  const ligar = () => {
    const alvo = pathname === "/wallets" ? (document.getElementById(CAMPO) ?? document.getElementById(ANCORA)) : null;
    if (!alvo) { router.push(`/wallets#${CAMPO}`); return; }
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    // O teclado abre logo no campo (sem saltar a página antes do scroll acabar).
    window.setTimeout(() => alvo.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 400);
  };
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3 text-xs text-sky-100 sm:flex-row sm:items-center sm:justify-between">
      <p className="leading-relaxed">🧪 {t("ex_banner")}</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={ligar} className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-sky-400">{t("ex_connect")}</button>
        <button type="button" onClick={() => { removerExemplo(); window.location.reload(); }} className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-sky-200 hover:border-sky-300 hover:text-white">{t("ex_remove")}</button>
      </div>
    </div>
  );
}
