'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Button, Card, CardHeader, Input } from '@/components/ui';
import { QrImage, useElapsedSeconds } from '@/components/channels/QrImage';
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
  const [sessionName, setSessionName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrIssuedAt, setQrIssuedAt] = useState(0);
  const lastQr = useRef<string | null>(null);

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
    if (!channel || !line || line.status === 'connected') {
      if (line?.status === 'connected') setShowQr(false);
      return;
    }
    const timer = window.setInterval(() => {
      const pull = showQr
        ? fetchWasenderQr(agentId, channel.id)
        : getWasenderLine(agentId, channel.id);
      pull
        .then((next) => {
          if (next.status === 'connected') {
            setLine(next);
            setShowQr(false);
            return;
          }
          if (next.qr && next.qr !== lastQr.current) {
            lastQr.current = next.qr;
            setQrIssuedAt(Date.now());
          }
          setLine((prev) => ({ ...next, qr: next.qr || prev?.qr }));
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [agentId, channel, line?.status, showQr]);

  async function handleCreate() {
    setBusy(true);
    setError('');
    try {
      const normalized = toSessionPhone(phone);
      if (!normalized) {
        setError('הספק דורש מספר. אפשר 054 או +972…');
        return;
      }
      const created = await createWasenderLine(agentId, {
        phone: normalized,
        session_name: sessionName.trim() || undefined,
        note: note.trim() || undefined,
      });
      setLine({ ...created, qr: undefined });
      setPhone('');
      setSessionName('');
      setNote('');
      setShowCreate(false);
      setShowQr(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function handleShowQr() {
    if (!channel) return;
    setBusy(true);
    setError('');
    try {
      const next = await connectWasenderLine(agentId, channel.id);
      if (!next.qr) {
        setError('הספק לא החזיר ברקוד. לחץ שוב.');
        return;
      }
      lastQr.current = next.qr;
      setQrIssuedAt(Date.now());
      setLine(next);
      setShowQr(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו להביא ברקוד');
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
      setShowQr(false);
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
      setShowQr(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  const status = line?.status || channel?.health_status || 'unknown';
  const hasSession = Boolean(line?.has_session);
  const visibleQr = hasSession && showQr && status !== 'connected' ? line?.qr || null : null;
  const elapsed = useElapsedSeconds(visibleQr && qrIssuedAt ? String(qrIssuedAt) : null);
  const normalized = toSessionPhone(phone);
  const showForm = canCreate && showCreate;

  return (
    <Card>
      <CardHeader
        action={
          hasSession ? (
            <span className={`text-xs ${status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {STATUS_LABEL[status] || status}
            </span>
          ) : null
        }
      >
        WhatsApp
      </CardHeader>

      <div className="space-y-4">
        {hasSession ? (
          <div className="space-y-1 text-sm text-[var(--text-secondary)]">
            {line?.session_name ? <p>{line.session_name}</p> : null}
            {line?.note ? <p>{line.note}</p> : null}
            {line?.phone ? <p dir="ltr">{line.phone}</p> : null}
            {!line?.session_name && !line?.note && !line?.phone ? <p>ממתין לסריקה</p> : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">אין חיבור. סופר־אדמין פותח סשן אצל הספק.</p>
        )}

        {canCreate && !hasSession && !showCreate && (
          <Button type="button" disabled={busy} onClick={() => setShowCreate(true)}>
            הוסף חיבור
          </Button>
        )}

        {showForm && (
          <div className="space-y-3">
            {hasSession ? (
              <p className="text-sm text-[var(--text-secondary)]">סשן חדש מחליף את הקיים אצל הספק. השיחות אצלנו נשארות.</p>
            ) : null}
            <Input
              label="מספר WhatsApp"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="054… או +972…"
              dir="ltr"
              hint={normalized ? `יישלח ${normalized}` : 'הספק דורש מספר בינלאומי'}
            />
            <Input
              label="שם סשן"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="כפי שיופיע אצל הספק"
              hint="אופציונלי. בלי זה יישלח שם הסוכן."
            />
            <Input
              label="הערה"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="רק אצלנו"
              hint="לא נשלח לספק."
            />
            <Button type="button" loading={busy} disabled={!normalized} onClick={handleCreate}>
              {hasSession ? 'החלף סשן' : 'הוסף חיבור'}
            </Button>
          </div>
        )}

        {visibleQr && (
          <div className="flex flex-col items-center gap-3 py-2">
            <QrImage value={visibleQr} className="w-56 h-56 rounded-2xl bg-white p-3" />
            <p className="text-sm text-center tabular-nums text-[var(--text-secondary)]">
              {elapsed == null ? '' : `נמשך לפני ${elapsed} שניות · הספק לא מחזיר תוקף`}
            </p>
            <p className="text-sm text-[var(--text-secondary)] text-center">
              לפתוח במחשב ולסרוק עם הטלפון של המספר הזה
            </p>
          </div>
        )}

        {hasSession && (
          <div className="flex flex-wrap gap-2">
            {canCreate && !showCreate && (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setShowCreate(true)}>
                סשן חדש
              </Button>
            )}
            {canManage && (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleShare}>
                קישור ללקוח
              </Button>
            )}
            {canManage && status !== 'connected' && (
              <Button type="button" variant="secondary" size="sm" loading={busy} onClick={handleShowQr}>
                {showQr ? 'רענן ברקוד' : 'הצג ברקוד'}
              </Button>
            )}
            {canManage && status === 'connected' && (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={handleDisconnect}>
                נתק
              </Button>
            )}
            {canDelete && (
              <Button type="button" variant="danger" size="sm" disabled={busy} onClick={handleDelete}>
                מחק
              </Button>
            )}
          </div>
        )}

        {canCreate && hasSession && channel && (
          <WasenderAdvancedSettings agentId={agentId} channelId={channel.id} onSaved={onChanged} />
        )}
        {shareNote && <p className="text-sm text-emerald-400">{shareNote}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Card>
  );
}
