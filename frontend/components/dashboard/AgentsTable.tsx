'use client';

import { useEffect, useState } from 'react';
import type { AgentTableRow } from '@/lib/types';
import { AgentAccordionDetail } from './AgentAccordionDetail';
import { exportConversations } from '@/lib/api';
import { ChannelIcon } from '@/components/ui/Icons';
import { ListPager } from '@/components/ui';
import { paginate } from '@/lib/pagination';

interface Props {
  rows: AgentTableRow[];
  loading: boolean;
  fromDate: string;
  toDate: string;
}

export function AgentsTable({ rows, loading, fromDate, toDate }: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  async function handleExport(e: React.MouseEvent, agentId: number) {
    e.stopPropagation();
    if (exportingId !== null) return;
    setExportingId(agentId);
    try {
      await exportConversations(agentId, fromDate, toDate);
    } catch (err) {
      alert((err as Error).message ?? 'שגיאה בייצוא');
    } finally {
      setExportingId(null);
    }
  }

  const filtered = rows.filter(
    (r) =>
      r.agent_name.includes(search) ||
      r.client_name.includes(search) ||
      r.agent_name.toLowerCase().includes(search.toLowerCase()) ||
      r.client_name.toLowerCase().includes(search.toLowerCase()),
  );
  const paged = paginate(filtered, page);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="bg-[var(--glass)] border border-[var(--edge)] rounded-xl p-6 animate-pulse">
        <div className="h-8 bg-[var(--glass-2)] rounded w-48 mb-4" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-[var(--glass-2)] rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-[var(--glass)] border border-[var(--edge)] rounded-xl overflow-hidden flex flex-col max-h-[min(32rem,70vh)]">
      <div className="p-4 border-b border-[var(--edge)] shrink-0">
        <input
          type="text"
          placeholder="חיפוש סוכן או לקוח..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-72 bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)]"
          dir="rtl"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm text-right">
          <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)]/95 backdrop-blur-md">
            <tr className="text-[var(--text-secondary)] border-b border-[var(--edge)] text-xs uppercase">
              <th className="px-4 py-3">סוכן</th>
              <th className="px-4 py-3">לקוח</th>
              <th className="px-4 py-3">ערוצים</th>
              <th className="px-4 py-3">שיחות</th>
              <th className="px-4 py-3">הודעות</th>
              <th className="px-4 py-3">עלויות כוללות</th>
              <th className="px-4 py-3">עלות/שיחה</th>
              <th className="px-4 py-3 w-20" />
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                  {search ? 'לא נמצאו תוצאות' : 'אין נתונים'}
                </td>
              </tr>
            )}
            {paged.items.map((row) => {
              const isExpanded = expandedId === row.agent_id;
              return (
                <>
                  <tr
                    key={row.agent_id}
                    onClick={() => toggleExpand(row.agent_id)}
                    className="border-b border-[var(--edge)] hover:bg-[var(--glass)] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--ink)]">{row.agent_name}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{row.client_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 text-base">
                        {(row.active_channels ?? []).length === 0 ? (
                          <span className="text-[var(--text-muted)] text-xs">—</span>
                        ) : (
                          (row.active_channels ?? []).map((ct) => (
                            <ChannelIcon key={ct} channelType={ct} size={20} />
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{row.total_conversations}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{row.total_messages}</td>
                    <td className="px-4 py-3 text-[var(--ink)] font-medium">₪{row.total_cost_ils.toFixed(2)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">₪{row.avg_cost_per_conversation_ils.toFixed(4)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {row.total_conversations > 0 && (
                        <button
                          onClick={(e) => handleExport(e, row.agent_id)}
                          disabled={exportingId !== null}
                          title="ייצוא שיחות ל-Excel"
                          className="text-xs px-2 py-1 rounded border border-[var(--acc)]/30 text-[var(--acc)] hover:bg-[var(--acc)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {exportingId === row.agent_id ? '...' : '⬇ Excel'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      <span className={`transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${row.agent_id}-detail`}>
                      <td colSpan={9} className="px-4 pb-4 bg-[var(--bg)]/40">
                        <AgentAccordionDetail
                          agentId={row.agent_id}
                          fromDate={fromDate}
                          toDate={toDate}
                          activeChannels={row.active_channels ?? []}
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
      <div className="px-4 py-3 border-t border-[var(--edge)] shrink-0">
        <ListPager
          page={paged.page}
          totalPages={paged.totalPages}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onPage={setPage}
        />
      </div>
    </div>
  );
}
