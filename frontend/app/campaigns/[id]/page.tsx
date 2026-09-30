'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/api/client';
import { readSse } from '@/lib/sse';
import {
  campaignAction,
  campaignLiveUrl,
  deleteCampaign,
  getCampaign,
  listRecipients,
  patchCampaign,
  type CampaignRow,
  type RecipientRow,
} from '@/lib/api/campaigns';
import { pauseLabel, reasonLabel, sessionLabel, statusLabel } from '@/components/campaigns/presentation';

export default function CampaignPage() {
  return (
    <AuthGuard>
      <Screen />
    </AuthGuard>
  );
}

function Screen() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const [row, setRow] = useState<CampaignRow | null>(null);
  const [people, setPeople] = useState<RecipientRow[]>([]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
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
      .then((res) => (res.ok ? readSse(res, () => { load().catch(() => undefined); }, ac.signal) : undefined))
      .catch(() => undefined);
    return () => ac.abort();
  }, [id]);

  async function act(action: 'pause' | 'resume' | 'retry' | 'finish') {
    setBusy(true);
    setError('');
    try {
      await campaignAction(id, action);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (!row) {
    return <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-[var(--text-muted)]">{error || 'טוען…'}</main>;
  }

  const paused = row.status === 'paused';
  const live = row.status === 'running';
  const open = live || paused || row.status === 'scheduled';

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
        <div>
          <Link href="/campaigns" className="text-xs text-[var(--text-muted)]">קמפיינים</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`status-dot ${live ? 'active' : 'inactive'}`} />
            <h1 className="text-2xl font-bold text-[var(--ink)]">{row.name}</h1>
            <span className="rounded-full border border-[var(--edge)] bg-[var(--glass-2)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              {statusLabel(row.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{row.agent_name} · {sessionLabel(row.session)}</p>
          {row.pause_reason && <p className="mt-1 text-sm text-[var(--text-secondary)]">{pauseLabel(row.pause_reason)}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="שליחה" value={`${row.send_percent}%`} />
          <Stat label="מענה" value={`${row.reply_percent}%`} />
          <Stat label="נמענים" value={String(row.recipient_count)} />
          {superAdmin && <Stat label="עלות" value={`${row.cost_ils ?? 0} ₪`} hint={`${row.tokens ?? 0} טוקנים · נמסר ${row.delivered_count ?? 0}`} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {live && <Button variant="secondary" loading={busy} onClick={() => act('pause')}>השהה</Button>}
          {paused && <Button loading={busy} onClick={() => act('resume')}>המשך</Button>}
          {open && <Button variant="secondary" loading={busy} onClick={() => act('finish')}>סיים</Button>}
          {row.status === 'finished' && superAdmin && (
            <Button variant="danger" loading={busy} onClick={() => remove()}>מחק לגמרי</Button>
          )}
          <Button variant="secondary" loading={busy} onClick={() => act('retry')}>נסה שוב נכשלים</Button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {paused && (
          <Card padding="lg" className="space-y-3">
            <Textarea
              label={row.mode === 'ai' ? 'פרומפט' : 'הודעה'}
              hint={`${row.step_sent_count} כבר קיבלו את הנוסח הקודם. השמירה חלה רק על מי שעוד לא קיבל.`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              loading={busy}
              onClick={() => actSave(row.mode === 'ai' ? { prompt: draft } : { template_body: draft })}
            >
              שמור נוסח
            </Button>
          </Card>
        )}
        <Card padding="lg" className="space-y-4">
          <Input label="חיפוש" value={q} onChange={(event) => setQ(event.target.value)} placeholder="שם או מספר" />
          <ul className="space-y-2">
            {people.map((person) => (
              <li key={person.phone} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--edge)] px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--ink)]">{person.name || 'בלי שם בקובץ'}</div>
                  <div className="text-xs text-[var(--text-muted)]">{person.phone}</div>
                </div>
                <div className="shrink-0 text-left">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${statusTone(person.status)}`}>
                    {statusLabel(person.status)}
                  </span>
                  {person.reason && (
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">{reasonLabel(person.reason)}</div>
                  )}
                </div>
              </li>
            ))}
            {people.length === 0 && <li className="py-6 text-center text-sm text-[var(--text-muted)]">אין נמענים להצגה</li>}
          </ul>
        </Card>
      </div>
    </div>
  );

  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteCampaign(id);
      router.push('/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
      setBusy(false);
    }
  }

  async function actSave(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await patchCampaign(id, body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }
}

function statusTone(status: string) {
  if (status === 'sent' || status === 'replied') return 'border-emerald-500/40 text-emerald-500';
  if (status === 'failed' || status === 'uncertain' || status === 'blocked') return 'border-red-500/40 text-red-400';
  return 'border-[var(--edge)] text-[var(--text-secondary)]';
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="sm">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--ink)]">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>}
    </Card>
  );
}
