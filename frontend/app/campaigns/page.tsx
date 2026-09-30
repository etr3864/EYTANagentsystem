'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Input, ListPager } from '@/components/ui';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { listCampaigns, type CampaignRow } from '@/lib/api/campaigns';
import { CampaignCard } from '@/components/campaigns/presentation';

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCampaigns({ q, page, status: finished ? 'finished' : undefined })
      .then((data) => {
        setRows(data.items);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'שגיאה'));
  }, [q, page, finished]);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--ink)]">קמפיינים</h1>
          {isSuperAdmin(user) && (
            <Link href="/campaigns/new">
              <Button>קמפיין חדש</Button>
            </Link>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="חיפוש"
              placeholder="שם קמפיין"
              value={q}
              onChange={(event) => { setPage(1); setQ(event.target.value); }}
            />
          </div>
          <Button variant="secondary" onClick={() => { setPage(1); setFinished((value) => !value); }}>
            {finished ? 'רצים ומושהים' : 'הסתיימו'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="space-y-3">
          {rows.map((row) => <CampaignCard key={row.id} row={row} />)}
          {rows.length === 0 && (
            <p className="rounded-[22px] border border-[var(--edge)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              {finished ? 'אין קמפיינים שהסתיימו' : 'אין קמפיינים רצים או מושהים'}
            </p>
          )}
        </div>
        {totalPages > 1 && (
          <ListPager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
