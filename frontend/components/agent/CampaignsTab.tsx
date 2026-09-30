'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listCampaigns, setCampaignFlag, type CampaignRow } from '@/lib/api/campaigns';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

export function CampaignsTab({
  agentId,
  enabled,
  onEnabled,
}: {
  agentId: number;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [paused, setPaused] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!superAdmin && !enabled) return;
    listCampaigns({ agentId, status: '' }).catch(() => setError('')).then((data) => {
      if (data) setRows(data.items.filter((row) => row.status !== 'finished'));
    });
  }, [agentId, enabled, superAdmin]);

  async function toggle(next: boolean) {
    if (!next && !window.confirm('לכבות קמפיינים? הרצים יושהו.')) return;
    const result = await setCampaignFlag(agentId, next, false);
    onEnabled(result.enabled);
    if (next) setPaused(result.paused);
  }

  async function resumePaused(yes: boolean) {
    if (yes) await setCampaignFlag(agentId, true, true);
    setPaused([]);
  }

  return (
    <div className="space-y-4">
      {superAdmin && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} />
          קמפיינים לסוכן הזה
        </label>
      )}
      {paused.length > 0 && (
        <div className="rounded-xl border border-[var(--edge)] p-4 space-y-2">
          <p className="text-sm">הקמפיינים האלה הושהו כשכיבית את המתג. להמשיך אותם?</p>
          <ul className="text-sm text-[var(--text-secondary)]">
            {paused.map((row) => <li key={row.id}>{row.name}</li>)}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="text-sm" onClick={() => resumePaused(true)}>להמשיך</button>
            <button type="button" className="text-sm text-[var(--text-muted)]" onClick={() => resumePaused(false)}>להשאיר בהשהיה</button>
          </div>
        </div>
      )}
      {(superAdmin ? enabled : true) && (
        <ul className="divide-y divide-[var(--edge)] rounded-xl border border-[var(--edge)]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/campaigns/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{row.name}</span>
                <span className="text-[var(--text-muted)]">{row.status} · שליחה {row.send_percent}% · מענה {row.reply_percent}%</span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-6 text-sm text-[var(--text-muted)]">אין קמפיינים פעילים</li>}
        </ul>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
