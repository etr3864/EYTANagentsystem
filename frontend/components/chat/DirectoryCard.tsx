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

export function DirectoryCard({ agentId, jid, onClose, onOpenCard, onOpenChat }: Props) {
  const [card, setCard] = useState<WasenderCard | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setCard(null);
    setZoom(false);
    setError('');
    getWasenderCard(agentId, jid)
      .then((row) => {
        setCard(row);
        setNote(row.note);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'לא נטען'));
  }, [agentId, jid]);

  const save = async () => {
    if (!card) return;
    setBusy(true);
    setError('');
    try {
      const saved = await saveWasenderCardNote(agentId, card.jid, note);
      setNote(saved.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת ההערה נכשלה');
    } finally {
      setBusy(false);
    }
  };

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
                {card.notify ? (
                  <p className="truncate text-xs text-[var(--text-secondary)]">{card.notify}</p>
                ) : null}
                {card.verified_name ? (
                  <p className="truncate text-xs text-[var(--text-secondary)]">{card.verified_name}</p>
                ) : null}
              </div>
            </div>
            {card.status ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                {card.status}
              </p>
            ) : null}
            <Button size="sm" onClick={openChat}>
              פתח צ׳אט
            </Button>
            <Textarea
              label="הערה אצלנו"
              value={note}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" disabled={busy} onClick={save}>
                {busy ? 'שומר…' : 'שמור הערה'}
              </Button>
            </div>
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
