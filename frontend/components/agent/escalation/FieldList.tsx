'use client';

import { Button } from '@/components/ui';
import { Input } from '@/components/ui/Input';
import type { EscalationField } from '@/lib/escalation';

const MAX_FIELDS = 12;

interface FieldListProps {
  fields: EscalationField[];
  onChange: (fields: EscalationField[]) => void;
}

function emptyField(): EscalationField {
  return { key: '', label: '', description: '', required: true };
}

export function FieldList({ fields, onChange }: FieldListProps) {
  const update = (index: number, patch: Partial<EscalationField>) => {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div>
        <p className="text-sm font-medium text-white">שדות שיישלחו</p>
        <p className="text-xs text-slate-500 mt-1">
          הסוכן ממלא אותם מהשיחה. שדה חדש נפתח מתחת לכפתור.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={fields.length >= MAX_FIELDS}
        onClick={() => onChange([emptyField(), ...fields])}
      >
        שדה ידני
      </Button>
      {fields.length === 0 && (
        <p className="text-xs text-slate-500">אין שדות עדיין. הפק מההנחיה או הוסף ידנית.</p>
      )}
      {fields.map((field, index) => (
        <div key={index} className="grid gap-2 rounded-lg border border-white/10 bg-[#0B0914]/60 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              label="מפתח JSON"
              value={field.key}
              onChange={(e) => update(index, { key: e.target.value })}
              placeholder="customer_name"
            />
            <Input
              label="שם בעברית"
              value={field.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="שם הלקוח"
            />
          </div>
          <Input
            label="מה הסוכן צריך לאסוף"
            value={field.description}
            onChange={(e) => update(index, { description: e.target.value })}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => update(index, { required: e.target.checked })}
              />
              חובה
            </label>
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-300"
              onClick={() => onChange(fields.filter((_, i) => i !== index))}
            >
              מחק שדה
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
