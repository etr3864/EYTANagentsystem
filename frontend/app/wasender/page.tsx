'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';
import { Button, Card, ListPager, ListViewport, BELOW_NAV_CLASS } from '@/components/ui';
import { adoptWasenderSessions, getAgents, listWasenderHub, resetWasenderExcept, type Agent, type WasenderLine } from '@/lib/api';
import { paginate } from '@/lib/pagination';

const PAGE_SIZE = 12;

const STATUS_LABEL: Record<string, string> = {
  need_scan: 'ממתין לסריקה',
  connecting: 'מתחבר',
  connected: 'מחובר',
  disconnected: 'מנותק',
  logged_out: 'נותק',
  expired: 'פג',
  unknown: 'לא ידוע',
};

function matchesSearch(row: WasenderLine, query: string): boolean {
  const hay = [row.agent_name, `סוכן ${row.agent_id}`, row.phone, row.note, STATUS_LABEL[row.status] || row.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function HubPage() {
  const [rows, setRows] = useState<WasenderLine[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  async function loadLines() {
    const [lines, agentRows] = await Promise.all([listWasenderHub(), getAgents()]);
    setRows(lines);
    setAgents(agentRows);
  }

  useEffect(() => {
    loadLines()
      .catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => matchesSearch(row, q));
  }, [rows, search]);

  const paged = paginate(filtered, page, PAGE_SIZE);
  const takenAgentIds = useMemo(() => new Set(rows.map((row) => row.agent_id)), [rows]);

  async function handleResetStale() {
    if (!confirm('למחוק את כל הערוצים חוץ מ-nella? השיחות נשארות, הסשנים הישנים לא.')) return;
    if (!confirm('בטוח? זה רץ על כולם מלבד סוכנים עם nella בשם.')) return;
    setResetting(true);
    setError('');
    setInfo('');
    try {
      const result = await resetWasenderExcept('nella');
      await loadLines();
      setInfo(`נשמרו ${result.kept} · אופסו ${result.cleared.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'איפוס נכשל');
    } finally {
      setResetting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    setInfo('');
    try {
      const result = await adoptWasenderSessions();
      await loadLines();
      const extra = [
        result.orphans.length ? `${result.orphans.length} בלי סוכן` : '',
        result.skipped ? `${result.skipped} דולגו (ישנים/כפולים)` : '',
      ].filter(Boolean);
      setInfo(`עודכנו ${result.matched} חיבורים${extra.length ? ` · ${extra.join(' · ')}` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'רענון נכשל');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className={`flex flex-col ${BELOW_NAV_CLASS}`}>
      <div className="max-w-3xl mx-auto px-3 md:px-6 py-4 w-full flex-1 min-h-0 flex flex-col gap-3">
        <div className="shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--ink)]">ערוצי תקשורת</h1>
              <p className="text-[var(--text-secondary)] mt-1 text-sm">מספרי WhatsApp של הסוכנים. חיבור, ברקוד ומחיקה גם אצל הסוכן.</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" loading={refreshing} onClick={handleRefresh}>
                רענן חיבורים
              </Button>
              <Button type="button" variant="danger" size="sm" loading={resetting} onClick={handleResetStale}>
                אפס חוץ מ-nella
              </Button>
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                ערוץ חדש
              </Button>
            </div>
          </div>

          <div className="relative">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש סוכן, מספר או הערה..."
              className="w-full bg-[var(--glass)] border border-[var(--edge)] rounded-2xl py-2.5 pr-10 pl-10 text-sm text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)] transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--ink)] transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}
        </div>

        {loading ? (
          <div className="h-24 rounded-lg skeleton" />
        ) : rows.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--text-secondary)]">אין ערוצים עדיין. לחץ «ערוץ חדש».</p>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">לא נמצאו ערוצים עבור «{search}»</p>
        ) : (
          <ListViewport
            footer={
              <ListPager
                page={paged.page}
                totalPages={paged.totalPages}
                from={paged.from}
                to={paged.to}
                total={paged.total}
                onPage={setPage}
              />
            }
          >
            <Card>
              <ul key={paged.page} className="divide-y divide-[var(--edge)] animate-fade-in">
                {paged.items.map((row) => (
                  <li key={row.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/agent/${row.agent_id}?tab=channels`} className="text-sm text-[var(--ink)] hover:underline">
                        {row.agent_name || `סוכן #${row.agent_id}`}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5" dir="ltr">
                        {row.phone}
                        {row.note ? ` · ${row.note}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs shrink-0 ${row.status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {STATUS_LABEL[row.status] || row.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </ListViewport>
        )}
      </div>

      {creating && (
        <CreateChannelModal
          agents={agents}
          takenAgentIds={takenAgentIds}
          onClose={() => setCreating(false)}
          onCreated={(line) => {
            setCreating(false);
            setRows((prev) => {
              const next = prev.filter((row) => row.id !== line.id);
              return [{ ...line, agent_name: agents.find((a) => a.id === line.agent_id)?.name }, ...next];
            });
            setPage(1);
            setInfo('הערוץ נוצר. שלח ללקוח קישור ברקוד מכרטיס הסוכן.');
          }}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard allowedRoles={['super_admin']}>
      <HubPage />
    </AuthGuard>
  );
}
