'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import { TestersPanel } from './TestersPanel';
import { TesterThread } from './TesterThread';
import {
  createPlaygroundLink,
  deletePlaygroundLink,
  listPlaygroundLinks,
  listPlaygroundTesters,
  restorePlaygroundLink,
  stopPlaygroundLink,
  type PlaygroundLinkRow,
  type PlaygroundTester,
} from '@/lib/api/playground';

const TTL_OPTIONS = [
  { seconds: 3600, label: 'שעה' },
  { seconds: 86400, label: '24 שעות' },
  { seconds: 604800, label: '7 ימים' },
  { seconds: 2592000, label: '30 ימים' },
];

const STATUS: Record<string, string> = {
  active: 'פעיל',
  stopped: 'עצור',
  expired: 'פג',
  deleted: 'נמחק',
  agent_inactive: 'סוכן כבוי',
  agent_gone: 'סוכן לא קיים',
};

function absUrl(path: string | null): string | null {
  if (!path || typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function PlaygroundLinksTab({ agentId }: { agentId: number }) {
  const [rows, setRows] = useState<PlaygroundLinkRow[]>([]);
  const [ttl, setTtl] = useState(604800);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openLink, setOpenLink] = useState<PlaygroundLinkRow | null>(null);
  const [testers, setTesters] = useState<PlaygroundTester[]>([]);
  const [testersLoading, setTestersLoading] = useState(false);
  const [openTesterId, setOpenTesterId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const data = await listPlaygroundLinks(agentId);
    setRows(data);
    setOpenLink((current) => current ? data.find((row) => row.id === current.id) || current : null);
  }, [agentId]);

  useEffect(() => {
    reload().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(path: string | null) {
    const url = absUrl(path);
    if (!url) return;
    await navigator.clipboard.writeText(url);
  }

  async function openTesters(row: PlaygroundLinkRow) {
    setOpenLink(row);
    setOpenTesterId(null);
    setTestersLoading(true);
    setError(null);
    try {
      setTesters(await listPlaygroundTesters(agentId, row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setTestersLoading(false);
    }
  }

  if (openLink && openTesterId != null) {
    return (
      <TesterThread
        agentId={agentId}
        linkId={openLink.id}
        userId={openTesterId}
        onBack={() => setOpenTesterId(null)}
      />
    );
  }

  if (openLink) {
    return (
      <div className="space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <TestersPanel
          link={openLink}
          testers={testers}
          loading={testersLoading}
          onBack={() => { setOpenLink(null); setTesters([]); }}
          onOpen={setOpenTesterId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>קישור בדיקה חדש</CardHeader>
        <p className="text-sm text-slate-400 mb-3">
          הפונקציות רצות על CRM אמיתי עם המספר שהבודק יקליד. תיאום פגישות רץ בשיחה ולא נרשם ביומן גוגל.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-300">
            תוקף
            <select
              className="mt-1 block px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white"
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
            >
              {TTL_OPTIONS.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>{opt.label}</option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy}
            onClick={() => run(() => createPlaygroundLink(agentId, ttl))}
          >
            צור קישור
          </Button>
        </div>
      </Card>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : (
        <Card>
          <CardHeader>קישורים</CardHeader>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">אין קישורים עדיין</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="border border-slate-700 rounded-lg p-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => openTesters(row)}
                    className="w-full text-right"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="text-white">{STATUS[row.status] || row.status}</span>
                      <span className="text-slate-400">
                        {row.conversation_count} שיחות · {row.tester_count} בודקים
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      פג {row.expires_at ? new Date(row.expires_at).toLocaleString('he-IL') : '—'}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {row.url && (
                      <Button variant="secondary" disabled={busy} onClick={() => copyUrl(row.url)}>
                        העתק
                      </Button>
                    )}
                    {row.status === 'active' && (
                      <Button variant="secondary" disabled={busy} onClick={() => run(() => stopPlaygroundLink(agentId, row.id))}>
                        עצור
                      </Button>
                    )}
                    {(row.status === 'stopped' || row.status === 'expired') && (
                      <Button variant="secondary" disabled={busy} onClick={() => run(() => restorePlaygroundLink(agentId, row.id))}>
                        שחזר
                      </Button>
                    )}
                    {row.status !== 'deleted' && (
                      <Button variant="secondary" disabled={busy} onClick={() => run(() => deletePlaygroundLink(agentId, row.id))}>
                        מחק
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openTesters(row)}>
                      תמלילים
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
