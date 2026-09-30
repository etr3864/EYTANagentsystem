'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Modal } from '@/components/ui';
import { isSuperAdmin } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { listCampaigns, setCampaignCaps, setCampaignFlag, type CampaignRow } from '@/lib/api/campaigns';
import { CampaignCard, FlagSwitch } from '@/components/campaigns/presentation';

export function CampaignsTab({
  agentId,
  enabled,
  hourly,
  daily,
  onEnabled,
}: {
  agentId: number;
  enabled: boolean;
  hourly: number | null;
  daily: number | null;
  onEnabled: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const [on, setOn] = useState(enabled);
  const [hourText, setHourText] = useState(hourly ? String(hourly) : '');
  const [dayText, setDayText] = useState(daily ? String(daily) : '');
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [paused, setPaused] = useState<{ id: number; name: string }[]>([]);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setOn(enabled); }, [enabled]);

  useEffect(() => {
    if (!on && superAdmin) return;
    listCampaigns({ agentId })
      .then((data) => setRows(data.items))
      .catch(() => setError('לא הצלחנו לטעון את הקמפיינים'));
  }, [agentId, on, superAdmin]);

  async function saveCaps() {
    setBusy(true);
    setError('');
    try {
      await setCampaignCaps(agentId, Number(hourText), Number(dayText));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function turn(next: boolean, resume = false) {
    setBusy(true);
    setError('');
    try {
      const result = await setCampaignFlag(agentId, next, resume);
      setOn(result.enabled);
      onEnabled(result.enabled);
      setConfirmOff(false);
      setPaused(next && !resume ? result.paused : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {superAdmin && (
        <div className="flex items-center justify-between gap-4 rounded-[22px] border border-[var(--edge)] bg-[var(--glass)] px-4 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`status-dot ${on ? 'active' : 'inactive'}`} />
              <span className="font-medium text-[var(--ink)]">{on ? 'פעיל' : 'כבוי'}</span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {on ? 'אפשר ליצור ולשלוח קמפיינים מהסוכן הזה.' : 'אין רשימה, ואי אפשר ליצור קמפיין.'}
            </p>
          </div>
          <FlagSwitch on={on} busy={busy} onToggle={() => (on ? setConfirmOff(true) : turn(true))} />
        </div>
      )}
      {superAdmin && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input label="הודעות בשעה" inputMode="numeric" value={hourText} onChange={(event) => setHourText(event.target.value.replace(/\D/g, '').slice(0, 4))} />
          <Input label="הודעות ביום" inputMode="numeric" value={dayText} onChange={(event) => setDayText(event.target.value.replace(/\D/g, '').slice(0, 5))} />
          <Button
            variant="secondary"
            loading={busy}
            disabled={!Number(hourText) || !Number(dayText)}
            onClick={() => saveCaps()}
          >
            שמור תקרה
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {on && (
        <div className="space-y-3">
          {rows.map((row) => <CampaignCard key={row.id} row={row} />)}
          {rows.length === 0 && (
            <p className="rounded-[22px] border border-[var(--edge)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              אין קמפיינים רצים או מושהים
            </p>
          )}
          {superAdmin && (
            <Link href="/campaigns/new" className="inline-flex">
              <Button>קמפיין חדש</Button>
            </Link>
          )}
        </div>
      )}
      {confirmOff && (
        <Modal title="לכבות קמפיינים?" onClose={() => setConfirmOff(false)}>
          <p className="text-sm text-[var(--text-secondary)]">קמפיינים שרצים עכשיו יושהו. מה שכבר נשלח נשמר.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>ביטול</Button>
            <Button variant="danger" loading={busy} onClick={() => turn(false)}>כבה</Button>
          </div>
        </Modal>
      )}
      {paused.length > 0 && (
        <Modal title="להמשיך קמפיינים?" onClose={() => setPaused([])}>
          <p className="text-sm text-[var(--text-secondary)]">אלה הושהו כשכיבית את המתג. קמפיין שהושהה ידנית נשאר מושהה.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {paused.map((row) => <li key={row.id}>{row.name}</li>)}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPaused([])}>להשאיר בהשהיה</Button>
            <Button loading={busy} onClick={() => turn(true, true)}>להמשיך</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
