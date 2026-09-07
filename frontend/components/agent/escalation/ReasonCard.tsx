'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { Input, Textarea } from '@/components/ui/Input';
import {
  generateEscalationFields,
  patchEscalation,
  type EscalationField,
  type EscalationReason,
} from '@/lib/escalation';
import { Destinations } from './Destinations';
import { FieldList } from './FieldList';

interface ReasonCardProps {
  agentId: number;
  item: EscalationReason;
  defaultOpen?: boolean;
  onChanged: (row: EscalationReason) => void;
  onDeleted: () => void;
}

export function ReasonCard({ agentId, item, defaultOpen, onChanged, onDeleted }: ReasonCardProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [name, setName] = useState(item.name);
  const [whenToUse, setWhenToUse] = useState(item.when_to_use);
  const [hint, setHint] = useState(item.payload_hint);
  const [fields, setFields] = useState<EscalationField[]>(item.fields);
  const [phones, setPhones] = useState<string[]>(item.phones);
  const [webhookUrl, setWebhookUrl] = useState(item.webhook_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const markSaved = (row: EscalationReason) => {
    setFields(row.fields);
    setPhones(row.phones);
    setWebhookUrl(row.webhook_url || '');
    setError(null);
    setSaved(true);
    onChanged(row);
  };

  const save = async (extra: { enabled?: boolean; name?: string } = {}) => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const row = await patchEscalation(agentId, item.id, {
        name: extra.name ?? name,
        when_to_use: whenToUse,
        payload_hint: hint,
        fields,
        phones,
        webhook_url: webhookUrl,
        ...extra,
      });
      markSaved(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await patchEscalation(agentId, item.id, { payload_hint: hint });
      markSaved(await generateEscalationFields(agentId, item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפקת שדות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const destCount = (item.phones?.length || 0) + (item.webhook_url ? 1 : 0);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-right">
          <p className="text-white font-medium truncate">{item.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.enabled ? 'פעיל' : 'כבוי'}
            {' · '}
            {item.fields.length} שדות
            {' · '}
            {destCount === 0 ? 'אין יעד' : `${destCount} יעדים`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => save({ enabled: !item.enabled })}
            className={`w-11 h-6 rounded-full relative ${item.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
            aria-label={item.enabled ? 'כבה' : 'הפעל'}
          >
            <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 ${item.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'סגור' : 'עריכה'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-red-400" onClick={onDeleted}>
            מחק
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <Input
            label="שם הסיבה"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            label="מתי להפעיל"
            value={whenToUse}
            onChange={(e) => setWhenToUse(e.target.value)}
            rows={3}
            hint="הנחיה לסוכן. למשל: כשלקוח מבקש סיור בתל אביב."
          />
          <Textarea
            label="מה לשלוח"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={3}
            hint="בעברית, חופשי. אחר כך לוחצים הפק שדות."
          />
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" disabled={busy || !hint.trim()} onClick={generate}>
              {busy ? 'מפיק…' : 'הפק שדות'}
            </Button>
          </div>
          <FieldList fields={fields} onChange={setFields} />
          <Destinations
            phones={phones}
            webhookUrl={webhookUrl}
            onPhonesChange={setPhones}
            onWebhookChange={setWebhookUrl}
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className={`text-sm min-h-[1.25rem] ${error ? 'text-red-400' : saved ? 'text-emerald-400' : 'text-transparent'}`}>
              {error || (saved ? 'נשמר' : '—')}
            </p>
            <Button variant="success" disabled={busy} onClick={() => save()}>
              {busy ? 'שומר…' : 'שמור'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
