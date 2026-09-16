'use client';

import { useState } from 'react';
import { Button, ListPager } from '@/components/ui';
import { parseUTCDate } from '@/lib/dates';
import { downloadPlaygroundTesterExport, type PlaygroundLinkRow, type PlaygroundTester } from '@/lib/api/playground';
import { LINK_STATUS, publicUrl, statusBadge } from './labels';
import { usePagedList } from '@/lib/usePagedList';

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
  const paged = usePagedList(testers);

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
    <div className="space-y-3 md:space-y-4 min-w-0 overflow-x-hidden">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" className="shrink-0 min-h-11" onClick={onBack}>
          ← קישורים
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${statusBadge(link.status)}`}>
              {LINK_STATUS[link.status] || link.status}
            </span>
            <h2 className="text-sm font-semibold text-[var(--ink)] truncate">התכתבויות</h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
            {link.conversation_count} שיחות · {link.tester_count} בודקים
          </p>
        </div>
        {link.url && (
          <div className="hidden md:block shrink-0">
            <Button variant="secondary" size="sm" onClick={copyUrl}>
              {copied ? 'הועתק' : 'העתק קישור'}
            </Button>
          </div>
        )}
      </div>
      {link.url && (
        <div className="md:hidden">
          <Button variant="secondary" size="sm" className="w-full min-h-11" onClick={copyUrl}>
            {copied ? 'הועתק' : 'העתק קישור'}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">טוען…</p>
      ) : testers.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">עדיין אין בודקים בקישור הזה</p>
      ) : (
        <div className="space-y-2">
          {paged.items.map((tester) => (
            <div
              key={tester.id}
              className="rounded-[22px] border border-[var(--edge)] bg-[var(--glass)] p-3 min-w-0 overflow-hidden"
            >
              <button type="button" onClick={() => onOpen(tester.id)} className="w-full min-w-0 text-right">
                <div className="text-sm text-[var(--ink)] truncate">{tester.label}</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                  {tester.conversation_count} שיחות
                  {tester.last_activity
                    ? ` · ${parseUTCDate(tester.last_activity)?.toLocaleString('he-IL') ?? ''}`
                    : ''}
                </div>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 w-full md:w-auto"
                  disabled={busyId === tester.id || tester.conversation_count === 0}
                  onClick={() => exportAll(tester.id)}
                >
                  <span className="md:hidden">ייצוא</span>
                  <span className="hidden md:inline">ייצוא JSON</span>
                </Button>
                <Button variant="ghost" size="sm" className="min-h-11 w-full md:w-auto" onClick={() => onOpen(tester.id)}>
                  פתח
                </Button>
              </div>
            </div>
          ))}
          <ListPager
            page={paged.page}
            totalPages={paged.totalPages}
            from={paged.from}
            to={paged.to}
            total={paged.total}
            onPage={paged.setPage}
          />
        </div>
      )}
    </div>
  );
}
