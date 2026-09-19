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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
      const created = await createWasenderLine(agentId);
      setLine(created);
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

  const status = line?.status || channel?.health_status || 'unknown';
  const hasSession = Boolean(line?.has_session);
  const image = qrSrc(line?.qr);
  const label = [line?.note, line?.phone].filter(Boolean).join(' · ');

  return (
    <div className="rounded-[22px] border border-[var(--edge)] bg-[var(--bg)]/80 backdrop-blur-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--ink)] text-sm">WhatsApp</h3>
          {hasSession && line ? (
            <p className="text-xs text-[var(--text-muted)] mt-0.5" dir="ltr">
              {label || 'ממתין לסריקה'}
            </p>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">אין חיבור</p>
          )}
        </div>
        {hasSession && (
          <span className={`text-xs ${status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>
            {STATUS_LABEL[status] || status}
          </span>
        )}
      </div>

      {canCreate && !hasSession && (
        <button
          type="button"
          disabled={busy}
          onClick={handleCreate}
          className="w-full py-2 rounded-lg text-sm bg-[var(--ink)] text-[var(--bg)]"
        >
          {busy ? 'יוצר…' : 'הוסף חיבור'}
        </button>
      )}

      {canCreate && hasSession && showCreate && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">סשן חדש מחליף את הקיים אצל הספק. השיחות אצלנו נשארות.</p>
          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="w-full py-2 rounded-lg text-sm bg-[var(--ink)] text-[var(--bg)]"
          >
            {busy ? 'יוצר…' : 'החלף סשן'}
          </button>
        </div>
      )}

      {hasSession && image && status !== 'connected' && (
        <div className="flex flex-col items-center gap-2">
          <img src={image} alt="QR" className="w-56 h-56 rounded-xl bg-white p-2" />
          <p className="text-xs text-[var(--text-secondary)] text-center">
            לפתוח במחשב ולסרוק עם הטלפון של המספר הזה
          </p>
        </div>
      )}

      {hasSession && (
        <div className="flex flex-wrap gap-2">
          {canCreate && !showCreate && (
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
          {canManage && (
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
      {canCreate && hasSession && channel && (
        <WasenderAdvancedSettings agentId={agentId} channelId={channel.id} onSaved={onChanged} />
      )}
      {shareNote && <p className="text-sm text-emerald-400">{shareNote}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
