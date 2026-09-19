'use client';

import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import type { ProviderSession } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  need_scan: 'ממתין לסריקה',
  connecting: 'מתחבר',
  connected: 'מחובר',
  disconnected: 'מנותק',
  logged_out: 'נותק',
  expired: 'פג',
  unknown: 'לא ידוע',
};

interface Props {
  rows: ProviderSession[];
  busyId: number | null;
  onDelete: (sessionId: number) => void;
}

export function ProviderSessions({ rows, busyId, onDelete }: Props) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--text-secondary)]">אין סשנים אצל הספק. אפשר לפתוח ערוץ חדש.</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-xs text-[var(--text-muted)] mb-2">אצל הספק · {rows.length} סשנים</p>
      <ul className="divide-y divide-[var(--edge)]">
        {rows.map((row) => (
          <SessionRow key={row.wasender_session_id} row={row} busy={busyId === row.wasender_session_id} onDelete={onDelete} />
        ))}
      </ul>
    </Card>
  );
}

function SessionRow({
  row,
  busy,
  onDelete,
}: {
  row: ProviderSession;
  busy: boolean;
  onDelete: (sessionId: number) => void;
}) {
  const title = row.agent_name || row.name || `סשן #${row.wasender_session_id}`;
  const href = row.agent_id ? `/agent/${row.agent_id}?tab=channels` : null;
  const body = (
    <>
      <p className="text-sm text-[var(--ink)] truncate">{title}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5" dir="ltr">
        {row.phone || '—'} · #{row.wasender_session_id}
      </p>
    </>
  );

  return (
    <li className="py-3 flex items-center justify-between gap-3">
      {href ? (
        <Link href={href} className="min-w-0 flex-1 rounded-xl -mx-1 px-1 py-0.5 hover:bg-[var(--glass-2)] transition">
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs ${row.status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>
          {STATUS_LABEL[row.status] || row.status}
        </span>
        <Button
          type="button"
          variant="danger"
          size="sm"
          loading={busy}
          onClick={() => onDelete(row.wasender_session_id)}
        >
          מחק
        </Button>
      </div>
    </li>
  );
}
