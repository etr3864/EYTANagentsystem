'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Card, TrashIcon, RefreshIcon } from '@/components/ui';
import { DataTable } from '@/components/database';
import {
  getAgents, deleteAgent,
  getUsers, deleteUser,
  getDbConversations, deleteConversation,
  getDbMessages, deleteDbMessage,
  getDbAppointments, deleteDbAppointment,
  getDbReminders, deleteDbReminder,
  getDbSummaries, deleteDbSummary,
  getDbMedia, deleteDbMedia,
  getDbTemplates, deleteDbTemplate,
  getDbFollowups, deleteDbFollowup,
  getDbChannels, deleteDbChannel,
  getDbChannelUsers, deleteDbChannelUser,
  type PaginatedResponse,
} from '@/lib/api';
import type { Agent, User } from '@/lib/types';
import {
  agentColumns, userColumns, conversationColumns, messageColumns,
  appointmentColumns, reminderColumns, summaryColumns,
  mediaColumns, templateColumns, followupColumns,
  channelColumns, channelUserColumns,
} from './columns';

// ── Tab definitions with categories ──────────────────────────────────────────

type Tab =
  | 'agents' | 'users' | 'channels' | 'channel-users'
  | 'conversations' | 'messages'
  | 'media' | 'templates'
  | 'appointments' | 'reminders' | 'followups' | 'summaries';

interface TabConfig { id: Tab; label: string }

interface Category { label: string; tabs: TabConfig[] }

const categories: Category[] = [
  { label: 'ליבה', tabs: [
    { id: 'agents', label: 'Agents' },
    { id: 'users', label: 'Users' },
    { id: 'channels', label: 'Channels' },
    { id: 'channel-users', label: 'Channel Users' },
  ]},
  { label: 'שיחות', tabs: [
    { id: 'conversations', label: 'Conversations' },
    { id: 'messages', label: 'Messages' },
  ]},
  { label: 'מדיה ותבניות', tabs: [
    { id: 'media', label: 'Media' },
    { id: 'templates', label: 'Templates' },
  ]},
  { label: 'אוטומציה', tabs: [
    { id: 'appointments', label: 'Appointments' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'summaries', label: 'Summaries' },
  ]},
];

const DELETE_FN: Partial<Record<Tab, (id: number) => Promise<void>>> = {
  agents: deleteAgent,
  users: deleteUser,
  channels: deleteDbChannel,
  'channel-users': deleteDbChannelUser,
  conversations: deleteConversation,
  messages: deleteDbMessage,
  media: deleteDbMedia,
  templates: deleteDbTemplate,
  appointments: deleteDbAppointment,
  reminders: deleteDbReminder,
  followups: deleteDbFollowup,
  summaries: deleteDbSummary,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function DatabasePage() {
  const [tab, setTab] = useState<Tab>('agents');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pageData, setPageData] = useState<PaginatedResponse<any>>({ items: [], page: 1, per_page: 50, total: 0, has_more: false });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isCustomTab = tab === 'agents' || tab === 'users';

  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab]);
  useEffect(() => { loadData(); }, [tab, page]);

  async function loadData() {
    setLoading(true);
    setSelected(new Set());
    setDeleteError(null);
    try {
      if (tab === 'agents') {
        setAgents(await getAgents());
      } else if (tab === 'users') {
        setUsers(await getUsers());
      } else {
        const fetchMap: Record<string, (p?: number) => Promise<PaginatedResponse<unknown>>> = {
          conversations: getDbConversations,
          messages: getDbMessages,
          appointments: getDbAppointments,
          reminders: getDbReminders,
          summaries: getDbSummaries,
          media: getDbMedia,
          templates: getDbTemplates,
          followups: getDbFollowups,
          channels: getDbChannels,
          'channel-users': getDbChannelUsers,
        };
        const fn = fetchMap[tab];
        if (fn) setPageData(await fn(page));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const toggleSelect = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: number[]) => {
    setSelected(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!confirm(`למחוק ${selected.size} רשומות?`)) return;
    setDeleteError(null);

    const deleteFn = DELETE_FN[tab];
    if (!deleteFn) return;

    try {
      for (const id of selected) {
        await deleteFn(id);
      }
      loadData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה במחיקה';
      setDeleteError(msg);
    }
  }

  // Client-side search filtering for agents/users (non-paginated)
  const filteredAgents = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(a => a.name.toLowerCase().includes(q) || String(a.id).includes(q));
  }, [agents, search]);

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      (u.name || '').toLowerCase().includes(q) || u.phone.includes(q) || String(u.id).includes(q)
    );
  }, [users, search]);

  function getDisplayData() {
    if (tab === 'agents') return filteredAgents;
    if (tab === 'users') return filteredUsers;
    return pageData.items;
  }

  function getTotal() {
    if (tab === 'agents') return filteredAgents.length;
    if (tab === 'users') return filteredUsers.length;
    return pageData.total;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columnMap: Record<Tab, any[]> = {
    agents: agentColumns,
    users: userColumns,
    channels: channelColumns,
    'channel-users': channelUserColumns,
    conversations: conversationColumns,
    messages: messageColumns,
    media: mediaColumns,
    templates: templateColumns,
    appointments: appointmentColumns,
    reminders: reminderColumns,
    followups: followupColumns,
    summaries: summaryColumns,
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-purple-500/10 bg-[#0B0914]/80 backdrop-blur-sm sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-lg md:text-xl shrink-0">
                🗄️
              </div>
              <div>
                <h1 className="font-semibold text-white text-sm md:text-base">Database</h1>
                <p className="text-xs text-slate-400 hidden sm:block">ניהול נתונים</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש..."
                  className="w-48 pl-8 pr-3 py-1.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                  dir="rtl"
                />
              </div>

              {selected.size > 0 && (
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  <TrashIcon />
                  <span className="hidden sm:inline">מחק</span> {selected.size}
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Category + Tab navigation */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 md:px-6">
          <nav className="flex gap-6 overflow-x-auto scrollbar-hide py-1">
            {categories.map(cat => (
              <div key={cat.label} className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mr-1 hidden md:inline">{cat.label}</span>
                {cat.tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-2.5 py-2.5 text-xs md:text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                      tab === t.id
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-6">
        {/* Delete error */}
        {deleteError && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center justify-between">
            <span>{deleteError}</span>
            <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Stats + refresh */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            {getTotal().toLocaleString()} רשומות
          </div>
          <button onClick={loadData} className="text-sm text-slate-400 hover:text-white flex items-center gap-1">
            <RefreshIcon />
            רענן
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <Card className="py-12">
            <div className="flex justify-center">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <DataTable
              data={getDisplayData()}
              columns={columnMap[tab]}
              selected={selected}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              page={isCustomTab ? 1 : pageData.page}
              total={getTotal()}
              perPage={isCustomTab ? 9999 : pageData.per_page}
              hasMore={isCustomTab ? false : pageData.has_more}
              onPageChange={setPage}
            />
          </Card>
        )}
      </main>
    </div>
  );
}
