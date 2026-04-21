'use client';

import { useEffect, useState } from 'react';
import { CHANNEL_DISPLAY_NAMES } from '@/lib/channels';
import { ChannelIcon } from '@/components/ui/Icons';

interface ChannelStat {
  channel_type: string;
  conversations: number;
  messages: number;
}

interface ChannelBreakdownCardProps {
  fromDate: string;
  toDate: string;
  agentId?: number;
  compact?: boolean;
  endpoint?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function ChannelBreakdownCard({ fromDate, toDate, agentId, compact, endpoint }: ChannelBreakdownCardProps) {
  const [stats, setStats] = useState<ChannelStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);

    const base = endpoint || `${API_URL}/api/super-admin/channel-breakdown`;
    const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
    if (agentId) params.set('agent_id', String(agentId));

    fetch(`${base}?${params}`, { headers: authHeaders() as HeadersInit })
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, agentId, endpoint]);

  const total = stats.reduce((sum, s) => sum + s.conversations, 0);

  return (
    <div className={compact ? '' : 'bg-[#131020] border border-slate-800 rounded-2xl p-5'}>
      {!compact && <h3 className="text-sm font-semibold text-white mb-4">פילוח ערוצים</h3>}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stats.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-3">אין נתוני ערוצים לתקופה זו</p>
      ) : (
        <div className="space-y-3">
          {stats.map(stat => {
            const pct = total > 0 ? Math.round((stat.conversations / total) * 100) : 0;
            const name = CHANNEL_DISPLAY_NAMES[stat.channel_type as keyof typeof CHANNEL_DISPLAY_NAMES] ?? stat.channel_type;
            return (
              <div key={stat.channel_type}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <ChannelIcon channelType={stat.channel_type} size={16} />
                    {name}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {stat.conversations.toLocaleString()} שיחות ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
