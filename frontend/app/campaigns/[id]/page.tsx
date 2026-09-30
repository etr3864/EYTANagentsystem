'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { phoneToUrl } from '@/lib/phone';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { BELOW_NAV_CLASS, Button, Card, Input, ListPager, ListViewport, Modal, Select, Textarea } from '@/components/ui';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/api/client';
import { readSse } from '@/lib/sse';
import {
  campaignAction,
  campaignLiveUrl,
  countReplies,
  deleteCampaign,
  getCampaign,
  listRecipients,
  openCampaignChat,
  patchCampaign,
  retryChosen,
  type CampaignRow,
  type RecipientRow,
} from '@/lib/api/campaigns';
import { gapText, pauseLabel, reasonLabel, sessionLabel, statusLabel } from '@/components/campaigns/presentation';

const PAGE_SIZE = 50;

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [replyAmount, setReplyAmount] = useState('7');
  const [replyUnit, setReplyUnit] = useState<'hours' | 'days'>('days');
  const pageRef = useRef(page);
  const qRef = useRef(q);
  const statusRef = useRef(statusFilter);
  pageRef.current = page;
  qRef.current = q;
  statusRef.current = statusFilter;

  async function load(nextPage = pageRef.current, nextQ = qRef.current, nextStatus = statusRef.current) {
    const [campaign, recipients] = await Promise.all([
      getCampaign(id),
      listRecipients(id, nextPage, nextQ, nextStatus),
    ]);
    setRow(campaign);
    setPeople(recipients.items);
    setTotal(recipients.total);
    setCounts(recipients.counts || {});
    setDraft(campaign.template_body || campaign.prompt || '');
    setReplyAmount(String(campaign.reply_window_amount ?? 7));
    setReplyUnit(campaign.reply_window_unit === 'hours' ? 'hours' : 'days');
  }

  useEffect(() => {
    load(page, q, statusFilter).catch((err) => setError(err instanceof Error ? err.message : 'שגיאה'));
  }, [id, page, q, statusFilter]);

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className={`flex flex-col ${BELOW_NAV_CLASS}`}>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 md:px-6">
        <div className="shrink-0 space-y-4">
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="שליחה" value={`${row.send_percent}%`} />
            <Stat label="מענה" value={`${row.reply_percent}%`} />
            <Stat label="נמענים" value={String(row.recipient_count)} />
            {superAdmin && <Stat label="עלות" value={`${row.cost_ils ?? 0} ₪`} hint={`${row.tokens ?? 0} טוקנים · נמסר ${row.delivered_count ?? 0}`} />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label="בין כל הודעה"
              value={gapText(row.gap_min_seconds, row.gap_max_seconds)}
              hint={row.hourly_cap ? `שעה חלקי ${row.hourly_cap}, ועוד עד 30%.` : 'אין תקרה שעתית'}
            />
            <Stat label="הודעה אחרונה" value={row.last_sent_at || 'עוד לא'} />
          </div>
          {superAdmin && (
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="חלון מענה"
                hint="נספר רק מי שכתב אחרי ההודעה, בתוך החלון"
                inputMode="numeric"
                value={replyAmount}
                onChange={(event) => setReplyAmount(event.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <Select
                label="יחידה"
                value={replyUnit}
                options={[{ value: 'hours', label: 'שעות' }, { value: 'days', label: 'ימים' }]}
                onChange={(event) => setReplyUnit(event.target.value === 'hours' ? 'hours' : 'days')}
              />
              <Button variant="secondary" loading={busy} onClick={() => saveWindow()}>שמור חלון</Button>
              {row.status === 'finished' && (
                <Button loading={busy} onClick={() => checkReplies()}>בדוק מענים</Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {live && <Button variant="secondary" loading={busy} onClick={() => act('pause')}>השהה</Button>}
            {paused && <Button loading={busy} onClick={() => act('resume')}>המשך</Button>}
            {open && <Button variant="secondary" loading={busy} onClick={() => act('finish')}>סיים</Button>}
            {row.status === 'finished' && superAdmin && (
              <Button variant="danger" loading={busy} onClick={() => remove()}>מחק לגמרי</Button>
            )}
            <Button variant="secondary" loading={busy} onClick={() => act('retry')}>נסה שוב נכשלים</Button>
            {picked.length > 0 && (live || paused) && (
              <Button loading={busy} onClick={() => setConfirmSend(true)}>
                שלח שוב לנבחרים ({picked.length})
              </Button>
            )}
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
        </div>
        <Card padding="lg" className="flex min-h-0 flex-1 flex-col">
          <Input
            label="חיפוש"
            value={q}
            onChange={(event) => { setPage(1); setQ(event.target.value); }}
            placeholder="שם או מספר"
          />
          {row.status === 'finished' && (
            <StatusFilters
              counts={counts}
              value={statusFilter}
              onChange={(value) => { setPage(1); setPicked([]); setStatusFilter(value); }}
            />
          )}
          <ListViewport
            className="mt-3"
            footer={(
              <ListPager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
            )}
          >
            <ul className="space-y-2">
              {people.map((person) => (
                <PersonRow
                  key={person.phone}
                  person={person}
                  campaignId={id}
                  agentId={row.agent_id}
                  picked={picked.includes(person.phone)}
                  onPick={(phone, on) => setPicked((current) => on ? [...current, phone] : current.filter((item) => item !== phone))}
                />
              ))}
              {people.length === 0 && <li className="py-6 text-center text-sm text-[var(--text-muted)]">אין נמענים להצגה</li>}
            </ul>
          </ListViewport>
        </Card>
      </div>
      {confirmSend && (
        <Modal title="לשלוח שוב לנבחרים?" onClose={() => setConfirmSend(false)}>
          <p className="text-sm text-[var(--text-secondary)]">
            ייתכן שההודעה כבר הגיעה. הם חוזרים לתור, אחד אחרי השני, באותו קצב.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSend(false)}>ביטול</Button>
            <Button loading={busy} onClick={() => resendChosen()}>שלח שוב</Button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function saveWindow() {
    setBusy(true);
    setError('');
    try {
      await patchCampaign(id, { reply_window_amount: Number(replyAmount), reply_window_unit: replyUnit });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function checkReplies() {
    setBusy(true);
    setError('');
    try {
      await countReplies(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function resendChosen() {
    setBusy(true);
    setError('');
    try {
      await retryChosen(id, picked);
      setPicked([]);
      setConfirmSend(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
      setConfirmSend(false);
    } finally {
      setBusy(false);
    }
  }

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

function PersonRow({
  person, campaignId, agentId, picked, onPick,
}: {
  person: RecipientRow;
  campaignId: number;
  agentId: number;
  picked: boolean;
  onPick: (phone: string, on: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const hasMessage = Boolean(person.body || person.media_url);
  const canResend = person.status === 'uncertain' || person.status === 'failed';

  async function openChat() {
    setOpening(true);
    try {
      const chat = await openCampaignChat(campaignId, person.phone);
      router.push(`/agent/${chat.agent_id || agentId}?conv=${phoneToUrl(chat.phone)}`);
    } catch {
      setOpening(false);
    }
  }
  return (
    <li className="rounded-2xl border border-[var(--edge)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {canResend ? (
            <input
              type="checkbox"
              checked={picked}
              aria-label={`בחר את ${person.name || person.phone}`}
              onChange={(event) => onPick(person.phone, event.target.checked)}
              className="h-4 w-4 shrink-0 accent-[var(--acc)]"
            />
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          {hasMessage ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? 'סגור הודעה' : 'הצג הודעה'}
              onClick={() => setOpen((value) => !value)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--glass-2)]"
            >
              <svg viewBox="0 0 14 14" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}>
                <path d="M9 2.5 4.5 7 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="h-7 w-7 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-[var(--ink)]">{person.name || 'בלי שם בקובץ'}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {person.phone}
              {person.sent_at ? ` · ${person.sent_at}` : ''}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {person.chat && (
            <Button type="button" size="sm" variant="secondary" loading={opening} onClick={openChat}>
              לשיחה
            </Button>
          )}
          <div className="text-left">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${statusTone(person.status)}`}>
              {statusLabel(person.status)}
            </span>
            {person.reason && (
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">{reasonLabel(person.reason)}</div>
            )}
          </div>
        </div>
      </div>
      {open && hasMessage && (
        <div className="mt-3 space-y-2 border-t border-[var(--edge)] pt-3">
          <SentMedia person={person} />
          {person.body && <p className="whitespace-pre-wrap text-sm text-[var(--ink)]">{person.body}</p>}
        </div>
      )}
    </li>
  );
}

function SentMedia({ person }: { person: RecipientRow }) {
  if (!person.media_url) return null;
  if (person.media_kind === 'image') {
    return <img src={person.media_url} alt={person.media_name || 'תמונה'} className="max-h-48 rounded-xl" />;
  }
  if (person.media_kind === 'video') {
    return <video src={person.media_url} controls className="max-h-48 rounded-xl" />;
  }
  return (
    <a href={person.media_url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--acc)] underline underline-offset-2">
      {person.media_name || 'קובץ'}
    </a>
  );
}

const FILTER_ORDER = ['sent', 'replied', 'opted_out', 'uncertain', 'failed', 'pending', 'blocked', 'skipped', 'invalid'];

function StatusFilters({
  counts, value, onChange,
}: {
  counts: Record<string, number>;
  value: string;
  onChange: (value: string) => void;
}) {
  const keys = FILTER_ORDER.filter((key) => counts[key]);
  if (keys.length === 0) return null;
  const all = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <FilterChip on={!value} label="הכל" count={all} onClick={() => onChange('')} />
      {keys.map((key) => (
        <FilterChip
          key={key}
          on={value === key}
          label={statusLabel(key)}
          count={counts[key]}
          onClick={() => onChange(key)}
        />
      ))}
    </div>
  );
}

function FilterChip({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
        on
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]'
          : 'border-[var(--edge)] bg-[var(--glass-2)] text-[var(--text-secondary)]'
      }`}
    >
      {label} · {count}
    </button>
  );
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
