'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, PasswordInput } from '@/components/ui';
import {
  getWasenderSettings,
  saveWasenderSettings,
  type WasenderSettings,
} from '@/lib/api';
import { toSessionPhone } from '@/lib/phone';

const FLAGS: Array<{ key: keyof WasenderSettings; label: string }> = [
  { key: 'account_protection', label: 'הגנת חשבון' },
  { key: 'log_messages', label: 'לוג הודעות אצל הספק' },
  { key: 'read_incoming_messages', label: 'סימון נקרא אוטומטי' },
  { key: 'auto_reject_calls', label: 'דחיית שיחות נכנסות' },
  { key: 'ignore_groups', label: 'התעלם מקבוצות' },
  { key: 'ignore_channels', label: 'התעלם מערוצי WhatsApp' },
  { key: 'ignore_broadcasts', label: 'התעלם משידורים' },
  { key: 'always_online', label: 'תמיד מחובר' },
];

interface Props {
  agentId: number;
  channelId: number;
  onSaved: () => void;
}

export function WasenderAdvancedSettings({ agentId, channelId, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WasenderSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    getWasenderSettings(agentId, channelId)
      .then(setForm)
      .catch((e) => setError(e instanceof Error ? e.message : 'טעינה נכשלה'));
  }, [open, agentId, channelId]);

  async function handleSave() {
    if (!form) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const saved = await saveWasenderSettings(agentId, channelId, {
        phone: toSessionPhone(form.phone) || form.phone,
        session_name: form.session_name ?? '',
        note: form.note ?? '',
        api_key: form.api_key,
        webhook_secret: form.webhook_secret,
        account_protection: form.account_protection,
        log_messages: form.log_messages,
        read_incoming_messages: form.read_incoming_messages,
        auto_reject_calls: form.auto_reject_calls,
        ignore_groups: form.ignore_groups,
        ignore_channels: form.ignore_channels,
        ignore_broadcasts: form.ignore_broadcasts,
        always_online: form.always_online,
      });
      setForm(saved);
      setInfo('נשמר אצלנו ואצל הספק.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!form?.webhook_url) return;
    await navigator.clipboard.writeText(form.webhook_url);
    setInfo('כתובת הוובהוק הועתקה');
  }

  return (
    <div className="border-t border-[var(--edge)] pt-3 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--ink)]"
      >
        {open ? 'הסתר הגדרות מתקדמות' : 'הגדרות מתקדמות'}
      </button>
      {open && !form && !error && <div className="h-16 rounded-lg skeleton" />}
      {open && form && (
        <div className="space-y-3">
          <Input
            label="מספר"
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
            hint={toSessionPhone(form.phone || '') ? `יישלח ${toSessionPhone(form.phone || '')}` : 'אפשר 054, +972 או 972'}
          />
          <Input
            label="שם סשן"
            value={form.session_name || ''}
            onChange={(e) => setForm({ ...form, session_name: e.target.value })}
            hint="מה שמוצג אצל הספק."
          />
          <Input
            label="הערה"
            value={form.note || ''}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            hint="רק אצלנו. לא נשלח לספק."
          />
          <PasswordInput
            label="API key של הסשן"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            hint="נוצר אצל הספק. עריכה רק אם החלפת מפתח בדשבורד והעתקת לכאן."
            dir="ltr"
            autoComplete="off"
          />
          <PasswordInput
            label="Webhook secret"
            value={form.webhook_secret}
            onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
            hint="חייב להיות זהה לסוד בדשבורד. בלי זה אימות הוובהוק נכשל."
            dir="ltr"
            autoComplete="off"
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-[var(--text-secondary)]">Webhook URL</p>
            <p className="text-xs font-mono text-[var(--text-muted)] break-all dir-ltr" dir="ltr">
              {form.webhook_url}
            </p>
            <button type="button" onClick={copyUrl} className="text-xs text-[var(--ink)] underline">
              העתק
            </button>
            <p className="text-[11px] text-[var(--text-muted)]">ננעל לכתובת שלנו. לא ניתנת לעריכה.</p>
          </div>
          {form.session_id != null && (
            <p className="text-xs text-[var(--text-muted)]" dir="ltr">session id: {form.session_id}</p>
          )}
          <div className="grid gap-2">
            {FLAGS.map((flag) => (
              <Checkbox
                key={flag.key}
                label={flag.label}
                checked={Boolean(form[flag.key])}
                onChange={(e) => setForm({ ...form, [flag.key]: e.target.checked })}
              />
            ))}
          </div>
          <Button type="button" size="sm" loading={busy} onClick={handleSave}>
            שמור הגדרות
          </Button>
        </div>
      )}
      {info && <p className="text-sm text-emerald-400">{info}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
