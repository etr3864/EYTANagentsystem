'use client';

import { useEffect, useState } from 'react';
import { Button, Textarea } from '@/components/ui';
import {
  getWasenderCard,
  saveWasenderCardNote,
  type WasenderCard,
  type WasenderCardMember,
} from '@/lib/api';
import { AvatarLightbox } from './AvatarLightbox';

interface Props {
  agentId: number;
  jid: string;
  onClose: () => void;
  onOpenCard?: (jid: string) => void;
  onOpenChat?: (phone: string, name: string) => void;
}

function memberLabel(row: WasenderCardMember): string {
  if (row.name) return row.name;
  if (row.phone) return `לקוח ${row.phone.slice(-4)}`;
  return 'משתתף';
}

function ParticipantRow({
  row,
  onCard,
  onChat,
}: {
  row: WasenderCardMember;
  onCard?: (jid: string) => void;
  onChat?: (phone: string, name: string) => void;
}) {
  const label = memberLabel(row);
  return (
    <div className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        disabled={!row.can_open}
        onClick={() => row.can_open && onCard?.(row.phone)}
        className="flex min-w-0 flex-1 items-center gap-3 text-right disabled:cursor-default"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--glass-2)] text-lg">
          👤
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--ink)]">
            {label}
            {row.is_admin ? (
              <span className="mr-1.5 text-[10px] font-normal text-[var(--acc)]">מנהל</span>
            ) : null}
          </p>
          {row.phone ? (
            <p className="truncate font-mono text-xs text-[var(--text-muted)]" dir="ltr">
              {row.phone}
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">אין מספר לפתיחת שיחה</p>
          )}
        </div>
      </button>
      {row.can_open ? (
        <button
          type="button"
          onClick={() => onChat?.(row.phone, label)}
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--acc)] hover:bg-[oklch(0.80_0.125_225_/_0.14)]"
        >
          צ׳אט
        </button>
      ) : null}
    </div>
  );
}

function StaffNote({
  agentId,
  jid,
  initial,
}: {
  agentId: number;
  jid: string;
  initial: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(!initial.trim());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSaved(initial);
    setDraft(initial);
    setEditing(!initial.trim());
    setHint('');
    setError('');
  }, [jid, initial]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(''), 2500);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const persist = async (text: string, ok: string) => {
    setBusy(true);
    setError('');
    try {
      const row = await saveWasenderCardNote(agentId, jid, text);
      setSaved(row.note);
      setDraft(row.note);
      setEditing(!row.note);
      setHint(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink)]">הערה אצלנו</p>
        {hint ? <span className="text-xs text-emerald-400">{hint}</span> : null}
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!editing && saved ? (
        <div className="rounded-2xl border border-[var(--edge)] bg-[var(--glass-2)] px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{saved}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setDraft(saved); setEditing(true); setHint(''); }}>
              ערוך
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => persist('', 'ההערה נמחקה')}>
              מחק
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Textarea
            value={draft}
            rows={3}
            placeholder="הערה פנימית — רק אצלנו"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {saved ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(saved); setEditing(false); }}>
                ביטול
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={busy || !draft.trim() || draft.trim() === saved}
              onClick={() => persist(draft.trim(), 'נשמר')}
            >
              {busy ? 'שומר…' : saved ? 'שמור שינוי' : 'שמור הערה'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ProfileFacts({ card }: { card: WasenderCard }) {
  const showNotify = Boolean(card.notify && card.notify !== card.name);
  const showDesc = card.kind === 'group' && Boolean(card.description);
  if (!showDesc && !card.verified_name && !showNotify) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--edge)] px-4 py-3 text-sm">
      {showDesc ? (
        <div>
          <p className="text-[11px] text-[var(--text-muted)]">תיאור הקבוצה</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[var(--ink)]">{card.description}</p>
        </div>
      ) : null}
      {card.verified_name ? (
        <div>
          <p className="text-[11px] text-[var(--text-muted)]">שם מאומת</p>
          <p className="mt-0.5 text-[var(--ink)]">{card.verified_name}</p>
        </div>
      ) : null}
      {showNotify ? (
        <div>
          <p className="text-[11px] text-[var(--text-muted)]">שם בתצוגה</p>
          <p className="mt-0.5 text-[var(--ink)]">{card.notify}</p>
        </div>
      ) : null}
    </div>
  );
}

export function DirectoryCard({ agentId, jid, onClose, onOpenCard, onOpenChat }: Props) {
  const [card, setCard] = useState<WasenderCard | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setZoom(false);
    setError('');
    getWasenderCard(agentId, jid)
      .then((row) => {
        if (!cancelled) setCard(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'לא נטען');
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, jid]);

  const openChat = () => {
    if (!card) return;
    onOpenChat?.(card.kind === 'group' ? card.jid : card.phone, card.name);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {zoom && card?.img_url ? (
        <AvatarLightbox src={card.img_url} alt={card.name} onClose={() => setZoom(false)} />
      ) : null}
      <div className="flex items-center gap-2 border-b border-[var(--edge)] px-4 py-2.5 shrink-0">
        <button type="button" onClick={onClose} className="text-sm text-[var(--ink)]">
          → חזרה
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!card && !error ? (
          <p className="p-4 text-sm text-[var(--text-muted)]">טוען…</p>
        ) : null}
        {error ? <p className="px-4 pt-3 text-sm text-red-400">{error}</p> : null}
        {card ? (
          <div className="space-y-5 p-5">
            <div className="flex items-center gap-4">
              {card.img_url ? (
                <button type="button" onClick={() => setZoom(true)} className="shrink-0">
                  <img
                    src={card.img_url}
                    alt=""
                    className="h-24 w-24 rounded-full object-cover ring-1 ring-[var(--edge)]"
                  />
                </button>
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[var(--glass-2)] text-4xl">
                  {card.kind === 'group' ? '👥' : '👤'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-medium text-[var(--ink)]">{card.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-muted)]" dir="ltr">
                  {card.kind === 'group' ? 'קבוצה' : card.phone}
                </p>
              </div>
            </div>
            <ProfileFacts card={card} />
            <Button size="sm" onClick={openChat}>
              פתח צ׳אט
            </Button>
            <StaffNote agentId={agentId} jid={card.jid} initial={card.note} />
            {card.kind === 'group' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-[var(--ink)]">
                  משתתפים ({card.participants.length})
                </p>
                <p className="text-xs text-[var(--text-muted)]">לחיצה לכרטיס · צ׳אט לשיחה</p>
                {card.participants.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">אין רשימת משתתפים מהספק</p>
                ) : (
                  <div className="divide-y divide-[var(--edge)] rounded-2xl border border-[var(--edge)]">
                    {card.participants.map((row) => (
                      <ParticipantRow
                        key={row.jid}
                        row={row}
                        onCard={onOpenCard}
                        onChat={onOpenChat}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
