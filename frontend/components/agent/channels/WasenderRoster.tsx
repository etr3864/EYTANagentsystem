'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui';
import { getWasenderRoster, type WasenderContact, type WasenderRoster } from '@/lib/api';

interface Props {
  agentId: number;
  channelId: number;
}

function Names({ title, rows }: { title: string; rows: WasenderContact[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-[var(--ink)]">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">אין</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-[var(--text-secondary)]">
          {rows.map((row) => (
            <li key={row.jid} className="truncate">
              {row.name || row.jid}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WasenderRoster({ agentId, channelId }: Props) {
  const [data, setData] = useState<WasenderRoster | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    getWasenderRoster(agentId, channelId)
      .then(setData)
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : 'לא הצלחנו למשוך אנשי קשר');
      });
  }, [agentId, channelId]);

  return (
    <Card>
      <CardHeader>ספר טלפונים וקבוצות</CardHeader>
      {error ? <p className="text-sm text-[var(--text-muted)]">{error}</p> : null}
      {data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Names title="אנשי קשר" rows={data.contacts} />
          <Names title="קבוצות" rows={data.groups} />
        </div>
      ) : !error ? (
        <p className="text-sm text-[var(--text-muted)]">טוען…</p>
      ) : null}
    </Card>
  );
}
