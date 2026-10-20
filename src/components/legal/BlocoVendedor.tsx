"use client";

// "Quem presta o serviço" nas páginas de Termos e Privacidade. Não aparece
// enquanto os dados legais não estiverem na Vercel (src/lib/legal/vendedor.ts).
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { VENDEDOR, vendedorDefinido } from "@/lib/legal/vendedor";

export default function BlocoVendedor() {
  const { t } = useLanguage();
  if (!vendedorDefinido()) return null;
  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
      <p className="font-semibold text-white">{t("legal_vendedor_h")}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-slate-500">{t("legal_vendedor_nome")}</dt><dd>{VENDEDOR.nome} ({t("legal_vendedor_tipo")})</dd>
        <dt className="text-slate-500">NIF</dt><dd>{VENDEDOR.nif}</dd>
        {VENDEDOR.morada && (<><dt className="text-slate-500">{t("legal_vendedor_morada")}</dt><dd>{VENDEDOR.morada}</dd></>)}
        <dt className="text-slate-500">{t("legal_vendedor_pais")}</dt><dd>{VENDEDOR.pais}</dd>
        <dt className="text-slate-500">{t("legal_vendedor_contacto")}</dt><dd><a href={`mailto:${VENDEDOR.email}`} className="underline decoration-dotted hover:text-white">{VENDEDOR.email}</a></dd>
      </dl>
    </div>
  );
}
