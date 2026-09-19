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
import { Button, Card, CardHeader, Input } from '@/components/ui';
import { QrImage } from '@/components/channels/QrImage';
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
      const normalized = toSessionPhone(phone);
      if (!normalized) {
        setError('הספק דורש מספר. אפשר 054 או +972…');
        return;
      }
      const created = await createWasenderLine(agentId, { phone: normalized });
      setLine(created);
      setPhone('');
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
  const label = [line?.note, line?.phone].filter(Boolean).join(' · ');
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
        <p className="text-sm text-[var(--text-secondary)]" dir={hasSession ? 'ltr' : 'rtl'}>
          {hasSession ? label || 'ממתין לסריקה' : 'אין חיבור. סופר־אדמין פותח סשן אצל הספק.'}
        </p>

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
            <Button type="button" loading={busy} disabled={!normalized} onClick={handleCreate}>
              {hasSession ? 'החלף סשן' : 'הוסף חיבור'}
            </Button>
          </div>
        )}

        {hasSession && line?.qr && status !== 'connected' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <QrImage value={line.qr} className="w-56 h-56 rounded-2xl bg-white p-3" />
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
            {canManage && (
              <Button type="button" variant="secondary" size="sm" loading={busy} onClick={handleConnect}>
                {status === 'connected' ? 'QR מחדש' : 'חבר'}
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
