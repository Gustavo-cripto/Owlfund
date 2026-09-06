"use client";

// Selo de plano ("Pro" / "Premium" / "Grátis" / "Todos") usado no menu, cartões
// do dashboard, landing, como-funciona e secções gated — para o utilizador ver
// de imediato o que exige que plano.
import { useLanguage } from "@/lib/i18n/LanguageContext";

export type PlanBadgePlan = "free" | "pro" | "premium" | "all";

export default function PlanBadge({ plan, size = "sm", className = "" }: { plan: PlanBadgePlan; size?: "sm" | "xs"; className?: string }) {
  const { t } = useLanguage();
  const cfg = {
    free:    { label: t("free"), cls: "bg-slate-700/60 text-slate-300 border-slate-600/40" },
    pro:     { label: "Pro", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
    premium: { label: "Premium", cls: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
    all:     { label: t("pb_all"), cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  }[plan];
  const px = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border font-bold ${px} ${cfg.cls} ${className}`}>{cfg.label}</span>;
}
