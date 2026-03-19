'use client';

import { useState, useEffect } from 'react';
import { getSuperAdminAgentDetail } from '@/lib/api';
import type { AgentDetail } from '@/lib/types';
import { KpiCard } from './KpiCard';

interface Props {
  agentId: number;
  fromDate: string;
  toDate: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 mt-5 first:mt-2">
      {children}
    </h4>
  );
}

export function AgentAccordionDetail({ agentId, fromDate, toDate }: Props) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    getSuperAdminAgentDetail(agentId, fromDate, toDate)
      .then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });

    return () => { cancelled = true; };
  }, [agentId, fromDate, toDate]);

  if (error) {
    return <p className="text-red-400 text-sm py-4">שגיאה בטעינת הנתונים</p>;
  }

  const p = detail?.performance;
  const cb = detail?.cost_by_provider;
  const cs = detail?.cost_by_source;
  const noData = detail !== null && (p?.total_conversations ?? 0) === 0;

  return (
    <div className="pt-4 space-y-1">
      {/* Summary highlight */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        <KpiCard
          title="סה״כ עלות"
          value={detail ? `₪${detail.total_cost_ils.toFixed(2)}` : 0}
          loading={loading}
          noData={noData}
        />
        <KpiCard
          title="עלות ממוצעת לשיחה"
          value={detail ? `₪${detail.avg_cost_per_conversation_ils.toFixed(4)}` : 0}
          loading={loading}
          noData={noData}
        />
        <KpiCard
          title="סה״כ פגישות"
          value={detail?.total_appointments ?? 0}
          loading={loading}
          noData={noData}
        />
      </div>

      {/* Performance */}
      <SectionTitle>ביצועים</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard title="שיחות" value={p?.total_conversations ?? 0} loading={loading} noData={noData} />
        <KpiCard title="הודעות" value={p?.total_messages ?? 0} loading={loading} noData={noData} />
        <KpiCard title="ממוצע הודעות לשיחה" value={p?.avg_messages_per_conversation ?? 0} loading={loading} noData={noData} />
        <KpiCard title="פגישות שנקבעו" value={p?.appointments_scheduled ?? 0} loading={loading} noData={noData} />
        <KpiCard title="אחוז המרה לפגישות" value={p?.conversion_rate ?? 0} suffix="%" loading={loading} noData={noData} />
        <KpiCard title="אחוז מענה לפולואפים" value={p?.followup_response_rate ?? 0} suffix="%" loading={loading} noData={noData} />
      </div>

      {/* Cost by provider */}
      <SectionTitle>עלויות לפי ספק</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Anthropic" value={cb ? `₪${cb.anthropic_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="Google" value={cb ? `₪${cb.google_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="OpenAI" value={cb ? `₪${cb.openai_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="אחר" value={cb ? `₪${cb.other_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
      </div>

      {/* Cost by source */}
      <SectionTitle>עלויות לפי מקור</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard title="שיחות" value={cs ? `₪${cs.conversation_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="פולואפים" value={cs ? `₪${cs.followup_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="סיכום הקשר" value={cs ? `₪${cs.context_summary_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="סיכום webhook" value={cs ? `₪${cs.summary_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
        <KpiCard title="תזכורות" value={cs ? `₪${cs.reminder_ils.toFixed(2)}` : 0} loading={loading} noData={noData} />
      </div>
    </div>
  );
}
