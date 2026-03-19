'use client';

import { useState } from 'react';
import type { AgentTableRow } from '@/lib/types';
import { AgentAccordionDetail } from './AgentAccordionDetail';

interface Props {
  rows: AgentTableRow[];
  loading: boolean;
  fromDate: string;
  toDate: string;
}

export function AgentsTable({ rows, loading, fromDate, toDate }: Props) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = rows.filter(
    (r) =>
      r.agent_name.includes(search) ||
      r.client_name.includes(search) ||
      r.agent_name.toLowerCase().includes(search.toLowerCase()) ||
      r.client_name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-white/[0.03] border border-purple-500/10 rounded-xl p-6 animate-pulse">
        <div className="h-8 bg-white/5 rounded w-48 mb-4" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-purple-500/10 rounded-xl overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-purple-500/10">
        <input
          type="text"
          placeholder="חיפוש סוכן או לקוח..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-72 bg-white/5 border border-purple-500/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
          dir="rtl"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="text-slate-400 border-b border-purple-500/10 text-xs uppercase">
              <th className="px-4 py-3">סוכן</th>
              <th className="px-4 py-3">לקוח</th>
              <th className="px-4 py-3">שיחות</th>
              <th className="px-4 py-3">הודעות</th>
              <th className="px-4 py-3">עלויות כוללות</th>
              <th className="px-4 py-3">עלות/שיחה</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {search ? 'לא נמצאו תוצאות' : 'אין נתונים'}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const isExpanded = expandedId === row.agent_id;
              return (
                <>
                  <tr
                    key={row.agent_id}
                    onClick={() => toggleExpand(row.agent_id)}
                    className="border-b border-purple-500/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-white">{row.agent_name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.client_name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.total_conversations}</td>
                    <td className="px-4 py-3 text-slate-300">{row.total_messages}</td>
                    <td className="px-4 py-3 text-white font-medium">₪{row.total_cost_ils.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-300">₪{row.avg_cost_per_conversation_ils.toFixed(4)}</td>
                    <td className="px-4 py-3 text-slate-400">
                      <span className={`transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${row.agent_id}-detail`}>
                      <td colSpan={7} className="px-4 pb-4 bg-[#06060E]/40">
                        <AgentAccordionDetail
                          agentId={row.agent_id}
                          fromDate={fromDate}
                          toDate={toDate}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
