import { useLanguage } from "@/lib/i18n/LanguageContext";

type Metric = { label: string; value: string };

type PnlSummaryCardProps = {
  position: number;
  today: number;
  days30?: number;
  daily7d: number;
  metrics?: Metric[];
  className?: string;
};

const formatValue = (value: number) =>
  value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSigned = (value: number) => {
  const sign = value >= 0 ? "+" : "-";
  return `${sign} € ${formatValue(Math.abs(value))}`;
};

const defaultMetrics: Metric[] = [
  { label: "Ativos monitorados", value: "120+" },
  { label: "Categorias personalizadas", value: "15" },
  { label: "Atualizações ao vivo", value: "1 min" },
];

export default function PnlSummaryCard({
  position,
  today,
  days30,
  daily7d,
  metrics = defaultMetrics,
  className = "",
}: PnlSummaryCardProps) {
  const { t } = useLanguage();
  return (
    <div
      className={`rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/20 via-slate-900 to-slate-950 p-6 ${className}`}
    >
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{t("pnl_summary")}</p>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{t("pnl_position")}</p>
            <p className="text-lg font-semibold text-emerald-400">{formatSigned(position)}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{t("pnl_today")}</p>
            <p className="text-lg font-semibold text-orange-300">{formatSigned(today)}</p>
          </div>
          {typeof days30 === "number" ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">{t("pnl_30d")}</p>
              <p className="text-lg font-semibold text-emerald-300">{formatSigned(days30)}</p>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{t("pnl_daily7")}</p>
            <p className="text-lg font-semibold text-rose-300">{formatSigned(daily7d)}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center"
            >
              <p className="text-lg font-semibold text-white">{metric.value}</p>
              <p className="text-[11px] text-slate-400">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
