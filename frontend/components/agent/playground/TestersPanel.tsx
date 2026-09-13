'use client';

import { Button } from '@/components/ui';
import { parseUTCDate } from '@/lib/dates';
import type { PlaygroundLinkRow, PlaygroundTester } from '@/lib/api/playground';

const STATUS: Record<string, string> = {
  active: 'פעיל',
  stopped: 'עצור',
  expired: 'פג',
  deleted: 'נמחק',
  agent_inactive: 'סוכן כבוי',
  agent_gone: 'סוכן לא קיים',
};

export function TestersPanel({
  link,
  testers,
  loading,
  onBack,
  onOpen,
}: {
  link: PlaygroundLinkRow;
  testers: PlaygroundTester[];
  loading: boolean;
  onBack: () => void;
  onOpen: (testerId: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>חזרה</Button>
        <div>
          <p className="text-sm text-white">{STATUS[link.status] || link.status}</p>
          <p className="text-xs text-slate-400">
            {link.conversation_count} שיחות · {link.tester_count} בודקים
          </p>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : testers.length === 0 ? (
        <p className="text-sm text-slate-400">עדיין אין בודקים בקישור הזה</p>
      ) : (
        <div className="space-y-2">
          {testers.map((tester) => (
            <button
              key={tester.id}
              type="button"
              onClick={() => onOpen(tester.id)}
              className="w-full text-right rounded-lg border border-slate-700 px-4 py-3 hover:bg-slate-800/40"
            >
              <div className="text-sm text-white">{tester.label}</div>
              <div className="text-xs text-slate-400 mt-1">
                {tester.conversation_count} שיחות
                {tester.last_activity
                  ? ` · ${parseUTCDate(tester.last_activity)?.toLocaleString('he-IL') ?? ''}`
                  : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
