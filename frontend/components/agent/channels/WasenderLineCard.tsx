'use client';

import { useEffect, useState } from 'react';
import {
  connectWasenderLine,
  createWasenderLine,
  deleteWasenderLine,
  disconnectWasenderLine,
  fetchWasenderQr,
  getWasenderLine,
  shareWasenderQrLink,
  type WasenderLine,
} from '@/lib/api';
import { type AgentChannel } from '@/lib/channels';
import { toSessionPhone } from '@/lib/phone';
import { WasenderAdvancedSettings } from './WasenderAdvancedSettings';

const STATUS_LABEL: Record<string, string> = {
  need_scan: 'ממתין לסריקה',
  connecting: 'מתחבר',
  connected: 'מחובר',
  disconnected: 'מנותק',
  logged_out: 'נותק מהטלפון',
  expired: 'פג',
  unknown: 'לא ידוע',
};

function qrSrc(qr?: string | null): string | null {
  if (!qr) return null;
  if (qr.startsWith('data:') || qr.startsWith('http')) return qr;
  return `data:image/png;base64,${qr}`;
}

interface Props {
  agentId: number;
  channel: AgentChannel | null;
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
  onChanged: () => void;
}

export function WasenderLineCard({ agentId, channel, canCreate, canManage, canDelete, onChanged }: Props) {
  const [line, setLine] = useState<WasenderLine | null>(null);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [showCreate, setShowCreate] = useState(!channel);

  useEffect(() => {
    if (!channel) {
      setLine(null);
      return;
    }
    getWasenderLine(agentId, channel.id)
      .then(setLine)
      .catch(() => {
        setLine({
          id: channel.id,
          agent_id: agentId,
          channel_type: channel.channel_type,
          phone: channel.external_account_id,
          note: channel.account_name,
          status: channel.health_status || 'unknown',
          is_active: channel.is_active,
          has_session: false,
          created_at: channel.created_at,
        });
      });
  }, [agentId, channel]);

  useEffect(() => {
    if (!channel || !line) return;
    if (line.status === 'connected') return;
    const timer = window.setInterval(() => {
      getWasenderLine(agentId, channel.id)
        .then((next) => {
          setLine((prev) => ({ ...next, qr: prev?.qr }));
          if (next.status === 'need_scan' || next.status === 'connecting') {
            fetchWasenderQr(agentId, channel.id)
              .then(setLine)
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [agentId, channel, line?.status]);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      const normalized = toSessionPhone(phone);
      if (!normalized) {
        setError('מספר לא תקין. אפשר 054, +972 או 972…');
        return;
      }
      const created = await createWasenderLine(agentId, { phone: normalized, note: note.trim() || undefined });
      setLine(created);
      setPhone('');
      setNote('');
      setShowCreate(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnect() {
    if (!channel) return;
    setBusy(true);
    setError('');
    try {
      setLine(await connectWasenderLine(agentId, channel.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'חיבור נכשל');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!channel) return;
    setBusy(true);
    setError('');
    try {
      setLine(await disconnectWasenderLine(agentId, channel.id));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ניתוק נכשל');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!channel) return;
    setBusy(true);
    setError('');
    setShareNote('');
    try {
      const row = await shareWasenderQrLink(agentId, channel.id);
      const url = `${window.location.origin}${row.path}`;
      await navigator.clipboard.writeText(url);
      setShareNote('הקישור הועתק. שלח ללקוח. תקף 24 שעות.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו ליצור קישור');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!channel) return;
    if (!confirm('למחוק את המופע אצל WaSender ואצלנו?')) return;
    setBusy(true);
    setError('');
    try {
      await deleteWasenderLine(agentId, channel.id);
      setLine(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  const status = line?.status || 'unknown';
  const image = qrSrc(line?.qr);

  return (
    <div className="rounded-[22px] border border-[var(--edge)] bg-[var(--bg)]/80 backdrop-blur-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--ink)] text-sm">WhatsApp</h3>
          {line && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5" dir="ltr">
              {line.phone}
              {line.note ? ` · ${line.note}` : ''}
            </p>
          )}
        </div>
        {line && (
          <span className={`text-xs ${status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>
            {STATUS_LABEL[status] || status}
          </span>
        )}
      </div>

      {!channel && !canCreate && (
        <p className="text-sm text-[var(--text-secondary)]">עדיין אין מספר מחובר. מנהל ראשי פותח את המופע.</p>
      )}

      {canCreate && (showCreate || !channel || !line?.has_session) && (
        <div className="space-y-2">
          {channel ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {line?.has_session
                ? 'סשן חדש מחליף את הקיים אצל הספק. השיחות אצלנו נשארות.'
                : 'יש שורת ערוץ ישנה בלי סשן חי. ממלאים מספר ויוצרים חיבור.'}
            </p>
          ) : null}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="054… או +972…"
            className="w-full bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm"
            dir="ltr"
          />
          {toSessionPhone(phone) && (
            <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">יישלח {toSessionPhone(phone)}</p>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (אופציונלי)"
            className="w-full bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !phone.trim()}
            onClick={handleCreate}
            className="w-full py-2 rounded-lg text-sm bg-[var(--ink)] text-[var(--bg)] disabled:opacity-40"
          >
            {busy ? 'יוצר…' : channel ? 'צור סשן' : 'הוסף מספר'}
          </button>
        </div>
      )}

      {channel && image && status !== 'connected' && (
        <div className="flex flex-col items-center gap-2">
          <img src={image} alt="QR" className="w-56 h-56 rounded-xl bg-white p-2" />
          <p className="text-xs text-[var(--text-secondary)] text-center">
            לפתוח במחשב ולסרוק עם הטלפון של המספר הזה
          </p>
        </div>
      )}

      {channel && (
        <div className="flex flex-wrap gap-2">
          {canCreate && line?.has_session && !showCreate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--edge)]"
            >
              סשן חדש
            </button>
          )}
          {canManage && (
            <button
              type="button"
              disabled={busy}
              onClick={handleShare}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--edge)]"
            >
              קישור ללקוח
            </button>
          )}
          {canManage && line?.has_session && (
            <button
              type="button"
              disabled={busy}
              onClick={handleConnect}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--edge)]"
            >
              {status === 'connected' ? 'QR מחדש' : 'חבר'}
            </button>
          )}
          {canManage && status === 'connected' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-lg text-xs border border-[var(--edge)]"
            >
              נתק
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/20"
            >
              מחק
            </button>
          )}
        </div>
      )}
      {canCreate && channel && (
        <WasenderAdvancedSettings agentId={agentId} channelId={channel.id} onSaved={onChanged} />
      )}
      {shareNote && <p className="text-sm text-emerald-400">{shareNote}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
