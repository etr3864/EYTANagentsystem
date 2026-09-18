'use client';

import { Card, CardHeader } from '@/components/ui';
import { NumberInput, Textarea } from '@/components/ui/Input';
import type { AgentSplitConfig } from '@/lib/types';

export function SplitSettings({
  config,
  onChange,
}: {
  config: AgentSplitConfig;
  onChange: (config: AgentSplitConfig) => void;
}) {
  return (
    <Card>
      <CardHeader>פיצול תשובה לבועות</CardHeader>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        הסוכן מייצר תשובה אחת. אם הוגדר פיצול, היא נשלחת ככמה הודעות עם הקלדה ביניהן.
        המספר המקסימלי הוא הגבול היחיד — ההוראה רק אומרת מתי לפצל, לא כמה.
      </p>

      <label className="flex items-center gap-2 mb-5 cursor-pointer">
        <span className="text-sm text-[var(--text-secondary)]">
          {config.enabled ? 'פעיל' : 'כבוי'}
        </span>
        <div
          dir="ltr"
          onClick={() => onChange({ ...config, enabled: !config.enabled })}
          className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${
            config.enabled ? 'bg-[var(--acc)]' : 'bg-[var(--bg-tertiary)]'
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
              config.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </div>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <NumberInput
          label="מקסימום הודעות"
          min={1}
          max={10}
          value={config.max_parts}
          onChange={(e) =>
            onChange({
              ...config,
              max_parts: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
            })
          }
          hint="1 = בלי פיצול. עודף מתמזג לבועה האחרונה."
        />
        <NumberInput
          label="השהייה בין הודעות (שניות)"
          min={1}
          max={4}
          value={config.delay_seconds}
          onChange={(e) =>
            onChange({
              ...config,
              delay_seconds: Math.max(1, Math.min(4, parseInt(e.target.value) || 2)),
            })
          }
          hint="הקלדה אמיתית בין בועות"
        />
      </div>

      <Textarea
        label="מתי לפצל"
        value={config.instruction}
        onChange={(e) => onChange({ ...config, instruction: e.target.value })}
        placeholder="פצל רק כשאדם היה שולח שתי הודעות נפרדות — למשל ברכה ואז שאלה."
        hint="ריק = ברירת מחדל. אל תכתוב כאן מספר הודעות."
      />
    </Card>
  );
}
