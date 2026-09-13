'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { parseUTCDate } from '@/lib/dates';
import { TestersPanel } from './TestersPanel';
import { TesterThread } from './TesterThread';
import { LINK_STATUS, publicUrl, statusBadge, tokensLabel } from './labels';
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

function whenLabel(iso: string | null, prefix: string): string {
  const date = parseUTCDate(iso);
  if (!date) return '';
  return `${prefix} ${date.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function PlaygroundLinksTab({ agentId }: { agentId: number }) {
  const [rows, setRows] = useState<PlaygroundLinkRow[]>([]);
  const [ttl, setTtl] = useState(604800);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [openLink, setOpenLink] = useState<PlaygroundLinkRow | null>(null);
  const [testers, setTesters] = useState<PlaygroundTester[]>([]);
  const [testersLoading, setTestersLoading] = useState(false);
  const [openTesterId, setOpenTesterId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const data = await listPlaygroundLinks(agentId);
    setRows(data);
    setOpenLink((current) => (current ? data.find((row) => row.id === current.id) || current : null));
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

  async function copyUrl(row: PlaygroundLinkRow) {
    const url = publicUrl(row.url);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedId(row.id);
    window.setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 1600);
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
          agentId={agentId}
          link={openLink}
          testers={testers}
          loading={testersLoading}
          onBack={() => { setOpenLink(null); setTesters([]); }}
          onOpen={(id) => setOpenTesterId(id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">קישורי בדיקה</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              הפונקציות רצות באמת עם המספר שהבודק יקליד. תיאום פגישות נשאר בשיחה ולא נכתב ליומן גוגל.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              תוקף
              <select
                className="mt-1 block px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-sm text-white"
                value={ttl}
                onChange={(e) => setTtl(Number(e.target.value))}
              >
                {TTL_OPTIONS.map((opt) => (
                  <option key={opt.seconds} value={opt.seconds}>{opt.label}</option>
                ))}
              </select>
            </label>
            <Button disabled={busy} onClick={() => run(() => createPlaygroundLink(agentId, ttl))}>
              צור קישור
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 px-1">אין קישורים עדיין — צור אחד למעלה</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <LinkRow
              key={row.id}
              row={row}
              busy={busy}
              copied={copiedId === row.id}
              onCopy={() => copyUrl(row)}
              onOpen={() => openTesters(row)}
              onStop={() => run(() => stopPlaygroundLink(agentId, row.id))}
              onRestore={() => run(() => restorePlaygroundLink(agentId, row.id))}
              onDelete={() => {
                if (!window.confirm('למחוק את הקישור? הבודקים לא יוכלו להיכנס.')) return;
                return run(() => deletePlaygroundLink(agentId, row.id));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkRow({
  row,
  busy,
  copied,
  onCopy,
  onOpen,
  onStop,
  onRestore,
  onDelete,
}: {
  row: PlaygroundLinkRow;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
  onStop: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const usage = tokensLabel(row.tokens_used, row.token_limit);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-right flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusBadge(row.status)}`}>
              {LINK_STATUS[row.status] || row.status}
            </span>
            <span className="text-sm text-white">
              {row.tester_count} בודקים · {row.conversation_count} שיחות
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {[
              whenLabel(row.expires_at, row.status === 'expired' ? 'פג' : 'עד'),
              usage,
            ].filter(Boolean).join(' · ')}
          </p>
        </button>
        <div className="flex flex-wrap gap-2">
          {row.url && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onCopy}>
              {copied ? 'הועתק' : 'העתק קישור'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onOpen}>
            התכתבויות
          </Button>
          {row.status === 'active' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onStop}>עצור</Button>
          )}
          {(row.status === 'stopped' || row.status === 'expired') && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onRestore}>שחזר</Button>
          )}
          {row.status !== 'deleted' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>מחק</Button>
          )}
        </div>
      </div>
    </div>
  );
}
