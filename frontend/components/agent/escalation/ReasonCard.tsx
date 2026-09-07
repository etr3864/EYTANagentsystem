'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';
import { Textarea } from '@/components/ui/Input';
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
  onChanged: (row: EscalationReason) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}

export function ReasonCard({ agentId, item, onChanged, onDeleted, onError }: ReasonCardProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [whenToUse, setWhenToUse] = useState(item.when_to_use);
  const [hint, setHint] = useState(item.payload_hint);
  const [fields, setFields] = useState<EscalationField[]>(item.fields);
  const [phones, setPhones] = useState<string[]>(item.phones);
  const [webhookUrl, setWebhookUrl] = useState(item.webhook_url || '');
  const [busy, setBusy] = useState(false);

  const save = async (extra: { enabled?: boolean; name?: string } = {}) => {
    setBusy(true);
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
      setFields(row.fields);
      onChanged(row);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      await patchEscalation(agentId, item.id, { payload_hint: hint });
      const row = await generateEscalationFields(agentId, item.id);
      setFields(row.fields);
      onChanged(row);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'הפקת שדות נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 text-right">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() && name.trim() !== item.name) save({ name: name.trim() });
            }}
            className="w-full bg-transparent text-white font-medium text-base border-b border-transparent hover:border-slate-600 focus:border-blue-500 focus:outline-none py-0.5"
          />
          <button type="button" className="text-xs text-slate-400 mt-0.5" onClick={() => setOpen(!open)}>
            {item.enabled ? 'פעיל' : 'כבוי'} · {open ? 'הסתר' : 'ערוך'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => save({ enabled: !item.enabled })}
            className={`w-11 h-6 rounded-full relative ${item.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
          >
            <span className={`w-5 h-5 bg-white rounded-full absolute top-0.5 ${item.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
          <button type="button" className="text-xs text-red-400" onClick={onDeleted}>מחק</button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-700/60 pt-4">
          <Textarea
            label="מתי להפעיל"
            value={whenToUse}
            onChange={(e) => setWhenToUse(e.target.value)}
            rows={3}
          />
          <Textarea
            label="מה לשלוח (בעברית) — משמש להפקת שדות"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" disabled={busy || !hint.trim()} onClick={generate}>
              {busy ? '...' : 'הפק שדות'}
            </Button>
          </div>
          <FieldList fields={fields} onChange={setFields} />
          <Destinations
            phones={phones}
            webhookUrl={webhookUrl}
            onPhonesChange={setPhones}
            onWebhookChange={setWebhookUrl}
          />
          <div className="flex justify-end">
            <Button variant="success" disabled={busy} onClick={() => save()}>
              שמור
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
