'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/api/client';
import { readSse } from '@/lib/sse';
import {
  campaignAction,
  campaignLiveUrl,
  getCampaign,
  listRecipients,
  patchCampaign,
  type CampaignRow,
  type RecipientRow,
} from '@/lib/api/campaigns';

export default function CampaignPage() {
  return (
    <AuthGuard>
      <Screen />
    </AuthGuard>
  );
}

function Screen() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [row, setRow] = useState<CampaignRow | null>(null);
  const [people, setPeople] = useState<RecipientRow[]>([]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [campaign, recipients] = await Promise.all([getCampaign(id), listRecipients(id, 1, q)]);
    setRow(campaign);
    setPeople(recipients.items);
    setDraft(campaign.template_body || campaign.prompt || '');
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'שגיאה'));
  }, [id, q]);

  useEffect(() => {
    const ac = new AbortController();
    authFetch(campaignLiveUrl(id), { signal: ac.signal })
      .then((res) => {
        if (!res.ok) return;
        return readSse(res, () => { load().catch(() => undefined); }, ac.signal);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [id]);

  if (!row) return <main className="max-w-5xl mx-auto px-4 py-6 text-sm">{error || 'טוען'}</main>;
  const paused = row.status === 'paused';

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">{row.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">{row.agent_name} · {row.session} · שליחה {row.send_percent}% · מענה {row.reply_percent}%</p>
          {row.pause_reason && <p className="text-sm">{reasonLabel(row.pause_reason)}</p>}
        </div>
        <div className="flex gap-2 text-sm">
          {row.status === 'running' && <button type="button" onClick={() => campaignAction(id, 'pause').then(load)}>השהה</button>}
          {paused && <button type="button" onClick={() => campaignAction(id, 'resume').then(load).catch((err) => setError(err.message))}>המשך</button>}
          <button type="button" onClick={() => campaignAction(id, 'retry').then(load)}>נסה שוב נכשלים</button>
        </div>
      </header>
      {isSuperAdmin(user) && (
        <p className="text-sm text-[var(--text-muted)]">עלות {row.cost_ils ?? 0} ₪ · {row.tokens ?? 0} טוקנים · נמסר {row.delivered_count ?? 0}</p>
      )}
      {paused && (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          const body = row.mode === 'ai' ? { prompt: draft } : { template_body: draft };
          patchCampaign(id, body).then(load).catch((err) => setError(err.message));
        }}>
          <textarea className="w-full min-h-28 bg-transparent border border-[var(--edge)] rounded-xl p-3 text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <p className="text-xs text-[var(--text-muted)]">{row.step_sent_count} כבר קיבלו את הנוסח הקודם</p>
          <button type="submit" className="text-sm">שמור נוסח</button>
        </form>
      )}
      <input className="w-full bg-transparent border border-[var(--edge)] rounded-xl px-3 py-2 text-sm" placeholder="טלפון" value={q} onChange={(event) => setQ(event.target.value)} />
      <ul className="divide-y divide-[var(--edge)] rounded-xl border border-[var(--edge)]">
        {people.map((person) => (
          <li key={person.phone} className="flex justify-between px-4 py-2 text-sm">
            <span>{person.phone}</span>
            <span className="text-[var(--text-muted)]">{person.status}{person.reason ? ` · ${person.reason}` : ''}</span>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </main>
  );
}

function reasonLabel(reason: string) {
  if (reason === 'session') return 'הסשן מנותק';
  if (reason === 'channel_refused') return 'הערוץ מסרב';
  if (reason === 'flag_off') return 'המתג כבוי';
  if (reason === 'agent_off') return 'הסוכן כבוי';
  return 'מושהה';
}
