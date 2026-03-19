'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSuperAdminSummary, getSuperAdminAgentsTable } from '@/lib/api';
import type { SystemSummary, AgentTableRow } from '@/lib/types';
import { KpiCard } from './KpiCard';
import { PresetBar } from './PresetBar';
import { AgentsTable } from './AgentsTable';
import { PricingPanel } from './PricingPanel';
import { getPresetDates, type Preset } from './datePresets';

const ILS = (v: number) => `₪${v.toFixed(2)}`;

export function SuperAdminDashboard() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [tableRows, setTableRows] = useState<AgentTableRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);

  const activeDates = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const fetchData = useCallback(async () => {
    const { from, to } = activeDates;
    if (!from || !to || to < from) return;

    setLoadingSummary(true);
    setLoadingTable(true);

    const [summaryResult, tableResult] = await Promise.allSettled([
      getSuperAdminSummary(from, to),
      getSuperAdminAgentsTable(from, to),
    ]);

    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    setLoadingSummary(false);

    if (tableResult.status === 'fulfilled') setTableRows(tableResult.value);
    setLoadingTable(false);
  }, [activeDates.from, activeDates.to]);

  useEffect(() => {
    fetchData();
  }, [activeDates.from, activeDates.to]);

  const handleCustomRange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    setPreset('custom');
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PresetBar
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={setPreset}
        onCustomRange={handleCustomRange}
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="סה״כ עלות"
          value={summary ? parseFloat(ILS(summary.total_cost_ils).replace('₪', '')) : 0}
          suffix=" ₪"
          loading={loadingSummary}
          noData={summary !== null && summary.total_conversations === 0}
        />
        <KpiCard
          title="סה״כ שיחות"
          value={summary?.total_conversations ?? 0}
          loading={loadingSummary}
          noData={summary !== null && summary.total_conversations === 0}
        />
        <KpiCard
          title="עלות ממוצעת לשיחה"
          value={summary ? parseFloat(summary.avg_cost_per_conversation_ils.toFixed(4)) : 0}
          suffix=" ₪"
          loading={loadingSummary}
          noData={summary !== null && summary.total_conversations === 0}
        />
        <KpiCard
          title="ממוצע הודעות לשיחה"
          value={summary?.avg_messages_per_conversation ?? 0}
          loading={loadingSummary}
          noData={summary !== null && summary.total_conversations === 0}
        />
      </div>

      {/* Agents Table */}
      <AgentsTable
        rows={tableRows}
        loading={loadingTable}
        fromDate={activeDates.from}
        toDate={activeDates.to}
      />

      {/* Pricing Panel */}
      <PricingPanel />
    </div>
  );
}
