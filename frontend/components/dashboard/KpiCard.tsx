'use client';

interface KpiCardProps {
  title: string;
  value: number | string;
  suffix?: string;
  loading?: boolean;
  noData?: boolean;
}

export function KpiCard({ title, value, suffix = '', loading = false, noData = false }: KpiCardProps) {
  return (
    <div className="bg-white/[0.03] border border-purple-500/10 rounded-xl p-4 sm:p-5 flex flex-col gap-2 backdrop-blur-sm min-w-0 overflow-hidden">
      <span className="text-xs sm:text-sm text-slate-400 truncate">{title}</span>
      {loading ? (
        <div className="h-8 sm:h-9 w-20 sm:w-24 rounded-lg skeleton" />
      ) : (
        <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums truncate">
          {value}{suffix}
        </span>
      )}
      {noData && !loading && (
        <span className="text-xs text-slate-500">אין נתונים בתקופה זו</span>
      )}
    </div>
  );
}
