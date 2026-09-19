'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';
import { ProviderSessions } from '@/components/channels/ProviderSessions';
import { Button, BELOW_NAV_CLASS } from '@/components/ui';
import {
  adoptWasenderSessions,
  deleteProviderSession,
  getAgents,
  listProviderSessions,
  type Agent,
  type ProviderSession,
} from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  need_scan: 'ממתין לסריקה',
  connecting: 'מתחבר',
  connected: 'מחובר',
  disconnected: 'מנותק',
  logged_out: 'נותק',
  expired: 'פג',
  unknown: 'לא ידוע',
};

function matchesSearch(row: ProviderSession, query: string): boolean {
  const hay = [
    row.agent_name,
    row.name,
    row.phone,
    String(row.wasender_session_id),
    STATUS_LABEL[row.status] || row.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function HubPage() {
  const [provider, setProvider] = useState<ProviderSession[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  async function loadLines() {
    const [agentRows, remote] = await Promise.all([getAgents(), listProviderSessions()]);
    setAgents(agentRows);
    setProvider(remote);
  }

  useEffect(() => {
    loadLines()
      .catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return provider;
    return provider.filter((row) => matchesSearch(row, q));
  }, [provider, search]);

  const takenAgentIds = useMemo(
    () => new Set(provider.map((row) => row.agent_id).filter((id): id is number => id != null)),
    [provider],
  );

  async function handleDeleteProvider(sessionId: number) {
    if (!confirm('למחוק את הסשן אצל הספק?')) return;
    setBusyId(sessionId);
    setError('');
    try {
      await deleteProviderSession(sessionId);
      await loadLines();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setBusyId(null);
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
              <p className="text-[var(--text-secondary)] mt-1 text-sm">הסשנים אצל הספק. חיבור וברקוד גם אצל הסוכן.</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" loading={refreshing} onClick={handleRefresh}>
                רענן חיבורים
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
        ) : search && filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">לא נמצאו סשנים עבור «{search}»</p>
        ) : (
          <ProviderSessions rows={filtered} busyId={busyId} onDelete={handleDeleteProvider} />
        )}
      </div>

      {creating && (
        <CreateChannelModal
          agents={agents}
          takenAgentIds={takenAgentIds}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            loadLines().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'));
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
