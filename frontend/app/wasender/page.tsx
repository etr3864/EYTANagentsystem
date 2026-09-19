'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Card, BELOW_NAV_CLASS, ListViewport } from '@/components/ui';
import { listWasenderHub, type WasenderLine } from '@/lib/api';

const STATUS_LABEL: Record<string, string> = {
  need_scan: 'ממתין לסריקה',
  connecting: 'מתחבר',
  connected: 'מחובר',
  disconnected: 'מנותק',
  logged_out: 'נותק',
  expired: 'פג',
};

function HubPage() {
  const [rows, setRows] = useState<WasenderLine[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listWasenderHub()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={`flex flex-col ${BELOW_NAV_CLASS}`}>
      <ListViewport>
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-6 pb-16 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--ink)]">מופעי WaSender</h1>
            <p className="text-[var(--text-secondary)] mt-1 text-sm">כל הסשנים אצלנו. מחיקה ו-QR מטאב הערוצים של הסוכן.</p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {loading ? (
            <div className="h-24 rounded-lg skeleton" />
          ) : rows.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--text-secondary)]">אין מופעים עדיין.</p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-[var(--edge)]">
                {rows.map((row) => (
                  <li key={row.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/agent/${row.agent_id}?tab=channels`} className="text-sm text-[var(--ink)] hover:underline">
                        סוכן #{row.agent_id}
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
          )}
        </div>
      </ListViewport>
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
