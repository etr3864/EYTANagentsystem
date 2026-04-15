'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAgents, getDashboardStats } from '@/lib/api';
import type { Agent, DashboardStats } from '@/lib/types';
import { KpiCard } from './KpiCard';
import { DateRangePicker } from './DateRangePicker';
import { getPresetDates, PRESETS, type Preset } from './datePresets';

const STALE_MS = 5 * 60 * 1000;

export function AdminDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | undefined>(undefined);
  const [preset, setPreset] = useState<Preset>('week');
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

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    setIsCustom(false);
  };

  const handleCustomRange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    setIsCustom(true);
  };

  const noData = stats !== null && !stats.has_data;
  const activePreset = isCustom ? null : preset;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activePreset === p.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <DateRangePicker
          from={activeDates.from}
          to={activeDates.to}
          isCustom={isCustom}
          onChange={handleCustomRange}
        />

        {agents.length > 1 && (
          <select
            value={selectedAgentId ?? ''}
            onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-white/5 border border-purple-500/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">כל הסוכנים</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
