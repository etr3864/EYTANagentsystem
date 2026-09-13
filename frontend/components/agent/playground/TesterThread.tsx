'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { AdminBubble, ExportButton, SessionDivider } from './AdminTranscript';
import {
  downloadPlaygroundExport,
  downloadPlaygroundTesterExport,
  getPlaygroundTester,
  type PlaygroundTesterDetail,
} from '@/lib/api/playground';

export function TesterThread({
  agentId,
  linkId,
  userId,
  onBack,
}: {
  agentId: number;
  linkId: number;
  userId: number;
  onBack: () => void;
}) {
  const [data, setData] = useState<PlaygroundTesterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'all' | number | null>(null);

  useEffect(() => {
    getPlaygroundTester(agentId, linkId, userId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'שגיאה'));
  }, [agentId, linkId, userId]);

  async function runExport(key: 'all' | number, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ייצוא נכשל');
    } finally {
      setBusy(null);
    }
  }

  const canExportAll = Boolean(data && data.conversations.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack}>← התכתבויות</Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{data?.tester.label || 'בודק'}</p>
            {data && (
              <p className="text-xs text-slate-400">{data.conversations.length} שיחות</p>
            )}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canExportAll || busy != null}
          onClick={() => runExport('all', () => downloadPlaygroundTesterExport(agentId, linkId, userId))}
        >
          ייצוא JSON
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : data.conversations.length === 0 ? (
        <p className="text-sm text-slate-400">אין שיחות לבודק הזה</p>
      ) : (
        data.conversations.map((conv) => (
          <Card key={conv.id} padding="sm">
            <SessionDivider at={conv.archived_at || conv.created_at} live={!conv.archived_at} />
            <ExportButton
              busy={busy != null}
              onClick={() => runExport(conv.id, () => downloadPlaygroundExport(agentId, linkId, conv.id))}
            />
            <div className="space-y-3">
              {conv.messages.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">אין הודעות</p>
              ) : (
                conv.messages.map((msg) => <AdminBubble key={msg.id} msg={msg} />)
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
