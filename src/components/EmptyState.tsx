"use client";

// Estado vazio de primeira vez (sem transacoes, sem ativos, sem carteiras).
//
// E o unico sitio onde o site gasta "orcamento de encanto": ve-se uma vez por
// conta, por isso pode ter um icone a flutuar e uma entrada em escala. Diz o
// que falta, porque, e da o caminho — nunca fica so um texto cinzento.
//
//   <EmptyState icon="📋" title={t("hx_no_tx")} description={t("hx_no_tx_desc")}>
//     <button …>Primeira compra</button>
//   </EmptyState>

type Props = {
  icon: string;
  title: string;
  description?: string;
  children?: React.ReactNode;   // botoes / links (opcional)
  compact?: boolean;            // dentro de um cartao ja pequeno
};

export default function EmptyState({ icon, title, description, children, compact }: Props) {
  return (
    <div className={`empty-state animate-scale-in rounded-2xl border border-dashed border-slate-700 text-center ${compact ? "p-5" : "p-8 sm:p-10"}`}>
      <div className="empty-icon relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10 ring-1 ring-orange-500/20" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-orange-500/20 blur-xl" />
        <span className={`relative ${compact ? "text-2xl" : "text-3xl"}`}>{icon}</span>
      </div>
      <p className={`mt-4 font-semibold text-white ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-400">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
