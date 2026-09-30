'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { listCampaigns, type CampaignRow } from '@/lib/api/campaigns';

export default function CampaignsPage() {
  return (
    <AuthGuard>
      <CampaignList />
    </AuthGuard>
  );
}

function CampaignList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [q, setQ] = useState('');
  const [showFinished, setShowFinished] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCampaigns({ q, status: showFinished ? 'finished' : undefined })
      .then((data) => setRows(data.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'שגיאה'));
  }, [q, showFinished]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium">קמפיינים</h1>
        {isSuperAdmin(user) && (
          <Link href="/campaigns/new" className="text-sm rounded-full px-4 py-2 bg-[var(--glass-2)]">קמפיין חדש</Link>
        )}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 bg-transparent border border-[var(--edge)] rounded-xl px-3 py-2 text-sm" placeholder="חיפוש" value={q} onChange={(event) => setQ(event.target.value)} />
        <button type="button" className="text-sm" onClick={() => setShowFinished((value) => !value)}>
          {showFinished ? 'רצים ומושהים' : 'הסתיימו'}
        </button>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <ul className="divide-y divide-[var(--edge)] rounded-xl border border-[var(--edge)]">
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/campaigns/${row.id}`} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
              <span>{row.name} · {row.agent_name}</span>
              <span className="text-[var(--text-muted)]">{row.status} · {row.session} · {row.send_percent}% / {row.reply_percent}%</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-8 text-sm text-[var(--text-muted)]">אין קמפיינים להצגה</li>}
      </ul>
    </main>
  );
}
