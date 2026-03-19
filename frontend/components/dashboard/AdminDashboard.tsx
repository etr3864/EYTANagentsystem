'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAgents, getDashboardStats } from '@/lib/api';
import type { Agent, DashboardStats } from '@/lib/types';
import { KpiCard } from './KpiCard';
import { DateRangePicker } from './DateRangePicker';

type Preset = 'today' | '7d' | 'week' | '30d' | 'month' | '90d' | 'custom' | 'all';

function getPresetDates(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = fmt(today);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case '7d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 6);
      return { from: fmt(d), to: todayStr };
    }
    case 'week': {
      const dayOfWeek = today.getDay();
      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - dayOfWeek - 7);
      const lastSaturday = new Date(lastSunday);
      lastSaturday.setDate(lastSunday.getDate() + 6);
      return { from: fmt(lastSunday), to: fmt(lastSaturday) };
    }
    case '30d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 29);
      return { from: fmt(d), to: todayStr };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case '90d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 89);
      return { from: fmt(d), to: todayStr };
    }
    case 'all':
      return { from: '2020-01-01', to: todayStr };
  }
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: '7d', label: '7 ימים' },
  { id: 'week', label: 'שבוע' },
  { id: '30d', label: '30 ימים' },
  { id: 'month', label: 'חודש' },
  { id: '90d', label: '90 ימים' },
  { id: 'custom', label: 'מותאם' },
  { id: 'all', label: 'הכל' },
];

const STALE_MS = 5 * 60 * 1000;

export function AdminDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>(undefined);
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {});
  }, []);

  const activeDates = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset);

  const fetchStats = useCallback(async (force = false) => {
    const { from, to } = activeDates;
    if (!from || !to || to < from) return;

    const now = Date.now();
    if (!force && now - lastFetchedAt < STALE_MS) return;

    setLoading(true);
    try {
      const data = await getDashboardStats(from, to, selectedAgentId);
      setStats(data);
      setLastFetchedAt(now);
    } catch {
      // keep previous stats visible on error
    } finally {
      setLoading(false);
    }
  }, [activeDates.from, activeDates.to, selectedAgentId, lastFetchedAt]);

  useEffect(() => {
    fetchStats(true);
  }, [activeDates.from, activeDates.to, selectedAgentId]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
  };

  const handleCustomRange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    setPreset('custom');
  };

  const noData = stats !== null && !stats.has_data;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => p.id !== 'custom' && handlePreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              } ${p.id === 'custom' ? 'cursor-default' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <DateRangePicker
          from={preset === 'custom' ? customFrom : ''}
          to={preset === 'custom' ? customTo : ''}
          onChange={handleCustomRange}
        />

        {agents.length > 1 && (
          <select
            value={selectedAgentId ?? ''}
            onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">כל הסוכנים</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="סה״כ שיחות" value={stats?.total_conversations ?? 0} loading={loading && !stats} noData={noData} />
        <KpiCard title="סה״כ הודעות" value={stats?.total_messages ?? 0} loading={loading && !stats} noData={noData} />
        <KpiCard title="ממוצע הודעות לשיחה" value={stats?.avg_messages_per_conversation ?? 0} loading={loading && !stats} noData={noData} />
        <KpiCard title="פגישות שנקבעו" value={stats?.appointments_scheduled ?? 0} loading={loading && !stats} noData={noData} />
        <KpiCard title="אחוז המרה לפגישות" value={stats?.conversion_rate ?? 0} suffix="%" loading={loading && !stats} noData={noData} />
        <KpiCard title="אחוז מענה לפולואפים" value={stats?.followup_response_rate ?? 0} suffix="%" loading={loading && !stats} noData={noData} />
      </div>
    </div>
  );
}
