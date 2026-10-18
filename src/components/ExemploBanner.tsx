"use client";

// Faixa do modo de exemplo (ver src/lib/demo/exemplo.ts): aparece nas páginas
// da conta que mostram as carteiras enquanto a conta ativa tiver o exemplo. Na
// inicial e nas outras páginas públicas não (14 out 2026: dizia "estás a ver
// dados de exemplo" por cima da página inicial, onde não há exemplo nenhum).

import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { removerExemplo } from "@/lib/demo/exemplo";
import { useExemploAtivo } from "@/lib/demo/useExemploAtivo";

const PAGINAS_DA_CONTA = ["/wallets", "/portfolio", "/dashboard", "/historico", "/gestor", "/fiscalidade", "/fire"];
// O campo "cola o teu endereço" do topo das Carteiras (o caminho mais curto,
// sobretudo no telemóvel); sem ele, os cartões das redes.
const CAMPO = "adicionar-endereco";
const ANCORA = "chain-cards";

export default function ExemploBanner() {
  const { t } = useLanguage();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ativo = useExemploAtivo();
  if (!ativo || !PAGINAS_DA_CONTA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  // Em Carteiras desce até ao campo "cola o teu endereço" (ou aos cartões das redes).
  const ligar = () => {
    const alvo = pathname === "/wallets" ? (document.getElementById(CAMPO) ?? document.getElementById(ANCORA)) : null;
    if (!alvo) { router.push(`/wallets#${CAMPO}`); return; }
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    // O teclado abre logo no campo (sem saltar a página antes do scroll acabar).
    window.setTimeout(() => alvo.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 400);
  };
  // 18 out 2026: quem acabava de criar conta via milhões e achava que eram seus.
  // A faixa passou a dizer logo no título que é uma conta de EXEMPLO, a amarelo,
  // e o "Remover exemplo" tem o mesmo peso que o "Ligar a minha carteira".
  return (
    <div role="status" className="mx-4 mb-4 mt-2 rounded-2xl border-2 border-amber-400/60 bg-amber-400/[0.12] px-4 py-4 sm:mx-6">
      <p className="text-base font-extrabold text-amber-100">🧪 {t("ex_title")}</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-50/90">{t("ex_banner")}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={ligar} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300">{t("ex_connect")}</button>
        <button type="button" onClick={() => { removerExemplo(); window.location.reload(); }} className="rounded-xl border-2 border-amber-300/70 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-400/15">✕ {t("ex_remove")}</button>
      </div>
    </div>
  );
}
