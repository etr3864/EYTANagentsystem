'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAgents, getDashboardStats } from '@/lib/api';
import type { Agent, DashboardStats } from '@/lib/types';
import { KpiCard } from './KpiCard';

type Preset = '7d' | '30d' | '90d' | 'month';

function getPresetDates(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toStr = fmt(today);

  if (preset === 'month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(first), to: toStr };
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setDate(today.getDate() - (days - 1));
  return { from: fmt(from), to: toStr };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: '7d', label: '7 ימים' },
  { id: '30d', label: '30 ימים' },
  { id: '90d', label: '90 ימים' },
  { id: 'month', label: 'החודש' },
];

const STALE_MS = 5 * 60 * 1000;

export function AdminDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>(undefined);
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {});
  }, []);

  const activeDates = isCustom
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
    setIsCustom(false);
  };

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setCustomFrom(value);
    else setCustomTo(value);
    setIsCustom(true);
  };

  const noData = stats !== null && !stats.has_data;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !isCustom && preset === p.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="date"
            value={isCustom ? customFrom : activeDates.from}
            onChange={(e) => handleCustomDate('from', e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <span>—</span>
          <input
            type="date"
            value={isCustom ? customTo : activeDates.to}
            onChange={(e) => handleCustomDate('to', e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

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
        <KpiCard
          title="סה״כ שיחות"
          value={stats?.total_conversations ?? 0}
          loading={loading && !stats}
          noData={noData}
        />
        <KpiCard
          title="סה״כ הודעות"
          value={stats?.total_messages ?? 0}
          loading={loading && !stats}
          noData={noData}
        />
        <KpiCard
          title="ממוצע הודעות לשיחה"
          value={stats?.avg_messages_per_conversation ?? 0}
          loading={loading && !stats}
          noData={noData}
        />
        <KpiCard
          title="פגישות שנקבעו"
          value={stats?.appointments_scheduled ?? 0}
          loading={loading && !stats}
          noData={noData}
        />
        <KpiCard
          title="אחוז המרה לפגישות"
          value={stats?.conversion_rate ?? 0}
          suffix="%"
          loading={loading && !stats}
          noData={noData}
        />
        <KpiCard
          title="אחוז מענה לפולואפים"
          value={stats?.followup_response_rate ?? 0}
          suffix="%"
          loading={loading && !stats}
          noData={noData}
        />
      </div>
    </div>
  );
}
