'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { parseUTCDate } from '@/lib/dates';
import { downloadPlaygroundTesterExport, type PlaygroundLinkRow, type PlaygroundTester } from '@/lib/api/playground';
import { LINK_STATUS, publicUrl, statusBadge } from './labels';

export function TestersPanel({
  agentId,
  link,
  testers,
  loading,
  onBack,
  onOpen,
}: {
  agentId: number;
  link: PlaygroundLinkRow;
  testers: PlaygroundTester[];
  loading: boolean;
  onBack: () => void;
  onOpen: (testerId: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copyUrl() {
    const url = publicUrl(link.url);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function exportAll(testerId: number) {
    setBusyId(testerId);
    setError(null);
    try {
      await downloadPlaygroundTesterExport(agentId, link.id, testerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ייצוא נכשל');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack}>← קישורים</Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusBadge(link.status)}`}>
                {LINK_STATUS[link.status] || link.status}
              </span>
              <h2 className="text-sm font-semibold text-white">התכתבויות</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {link.conversation_count} שיחות · {link.tester_count} בודקים
            </p>
          </div>
        </div>
        {link.url && (
          <Button variant="secondary" size="sm" onClick={copyUrl}>
            {copied ? 'הועתק' : 'העתק קישור'}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : testers.length === 0 ? (
        <p className="text-sm text-slate-400">עדיין אין בודקים בקישור הזה</p>
      ) : (
        <div className="space-y-2">
          {testers.map((tester) => (
            <div
              key={tester.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
            >
              <button type="button" onClick={() => onOpen(tester.id)} className="min-w-0 flex-1 text-right">
                <div className="text-sm text-white">{tester.label}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {tester.conversation_count} שיחות
                  {tester.last_activity
                    ? ` · ${parseUTCDate(tester.last_activity)?.toLocaleString('he-IL') ?? ''}`
                    : ''}
                </div>
              </button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === tester.id || tester.conversation_count === 0}
                  onClick={() => exportAll(tester.id)}
                >
                  ייצוא JSON
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onOpen(tester.id)}>
                  פתח
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
