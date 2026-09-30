'use client';

import type { RefObject } from 'react';
import { Button, Input, ModelSelect, Select, Textarea } from '@/components/ui';
import { FlagSwitch } from '@/components/campaigns/presentation';
import type { Agent } from '@/lib/types';

export const TIMEZONES = [
  { value: 'Asia/Jerusalem', label: 'ישראל' },
  { value: 'Europe/London', label: 'לונדון' },
  { value: 'Europe/Paris', label: 'פריז' },
  { value: 'America/New_York', label: 'ניו יורק' },
  { value: 'America/Los_Angeles', label: 'לוס אנג׳לס' },
  { value: 'Asia/Dubai', label: 'דובאי' },
];

export function canContinue(step: number, fields: {
  agentId: string; name: string; importId: number | null; phoneColumn: string; text: string;
  hourly: string; daily: string; mode: 'template' | 'ai'; columns: string[];
}) {
  if (step === 0) return Boolean(fields.agentId && fields.name.trim());
  if (step === 1) return Boolean(fields.importId && fields.phoneColumn);
  if (step === 2) {
    if (!fields.text.trim()) return false;
    if (fields.mode === 'template' && unknownNames(fields.text, fields.columns).length > 0) return false;
    return true;
  }
  if (step === 3) return Boolean(Number(fields.hourly) > 0 && Number(fields.daily) > 0);
  return true;
}

function digits(value: string, max: number) {
  return value.replace(/\D/g, '').slice(0, max);
}

function usedNames(text: string) {
  return [...text.matchAll(/\{\{\s*([^{}]+)\s*\}\}/g)].map((match) => match[1].trim()).filter(Boolean);
}

function unknownNames(text: string, columns: string[]) {
  return usedNames(text).filter((name) => !columns.includes(name));
}

export function AgentStep({
  query, onQuery, agents, agentId, onAgent, name, onName,
}: {
  query: string;
  onQuery: (value: string) => void;
  agents: Agent[];
  agentId: string;
  onAgent: (id: string) => void;
  name: string;
  onName: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">רק סוכן שהמתג שלו דלוק. הקמפיין יישלח מהסשן המחובר שלו.</p>
      <Input label="סוכן" placeholder="חיפוש לפי שם" value={query} onChange={(event) => onQuery(event.target.value)} />
      <div className="max-h-48 space-y-1 overflow-auto">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onAgent(String(agent.id))}
            className={`block w-full rounded-2xl border px-4 py-2.5 text-right text-sm ${
              agentId === String(agent.id)
                ? 'border-[var(--acc)] bg-[var(--glass-2)] text-[var(--ink)]'
                : 'border-[var(--edge)] text-[var(--text-secondary)]'
            }`}
          >
            {agent.name}
          </button>
        ))}
        {agents.length === 0 && <p className="text-sm text-[var(--text-muted)]">אין סוכן עם מתג דלוק</p>}
      </div>
      <Input label="שם הקמפיין" value={name} onChange={(event) => onName(event.target.value)} placeholder="למשל מבצע אפריל" />
    </div>
  );
}

export function FileStep({
  fileRef, fileName, headers, phoneColumn, onColumn, onPick, onFile,
}: {
  fileRef: RefObject<HTMLInputElement | null>;
  fileName: string;
  headers: string[];
  phoneColumn: string;
  onColumn: (value: string) => void;
  onPick: () => void;
  onFile: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">השורה הראשונה היא כותרות. אחר כך בוחרים איזו עמודה היא הטלפון.</p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Button type="button" variant="secondary" onClick={onPick}>
        {fileName || 'בחרו csv או xlsx'}
      </Button>
      {headers.length > 0 && (
        <Select
          label="עמודת הטלפון"
          value={phoneColumn}
          options={headers.map((header) => ({ value: header, label: header }))}
          onChange={(event) => onColumn(event.target.value)}
        />
      )}
    </div>
  );
}

export function MessageStep({
  dupes, onDropDupes, mode, onMode, text, onText, columns, writerModel, onWriter, rephrase, onRephrase, sample, onSample,
  mediaRef, mediaName, mediaNote, onNote, onPickMedia, onMedia,
}: {
  dupes: number;
  onDropDupes: () => void;
  mode: 'template' | 'ai';
  onMode: (mode: 'template' | 'ai') => void;
  text: string;
  onText: (value: string) => void;
  columns: string[];
  writerModel: string;
  onWriter: (value: string) => void;
  rephrase: boolean;
  onRephrase: (value: boolean) => void;
  sample: string;
  onSample: () => void;
  mediaRef: RefObject<HTMLInputElement | null>;
  mediaName: string;
  mediaNote: string;
  onNote: (value: string) => void;
  onPickMedia: () => void;
  onMedia: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      {dupes > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 px-4 py-3">
          <p className="text-sm">{dupes} מספרים כבר בקמפיין אחר של הסוכן</p>
          <Button type="button" size="sm" variant="secondary" onClick={onDropDupes}>הסר אותם</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <ModeButton on={mode === 'template'} label="תבנית קבועה" hint="{{שם}} מוחלף מהקובץ" onClick={() => onMode('template')} />
        <ModeButton on={mode === 'ai'} label="ניסוח לכל אחד" hint="נכתב מאפס לפי השורה" onClick={() => onMode('ai')} />
      </div>
      <Textarea
        label={mode === 'ai' ? 'פרומפט' : 'הודעה'}
        hint={mode === 'template' ? 'לחצו על עמודה כדי להכניס אותה. משתנה בלי עמודה לא נשמר.' : 'תא ריק לא יימסר, ואין להמציא אותו'}
        value={text}
        onChange={(event) => onText(event.target.value)}
      />
      {mode === 'template' && (
        <ColumnTokens columns={columns} text={text} onInsert={(name) => onText(`${text}${text.endsWith(' ') || !text ? '' : ' '}{{${name}}}`)} />
      )}
      {mode === 'template' && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--edge)] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">ניסוח מחדש</p>
            <p className="text-xs text-[var(--text-muted)]">שינוי קטן בניסוח בכל הודעה, בלי לשנות עובדות. מוריד את הדמיון בין ההודעות.</p>
          </div>
          <FlagSwitch on={rephrase} onToggle={() => onRephrase(!rephrase)} />
        </div>
      )}
      {(mode === 'ai' || rephrase) && (
        <ModelSelect label="המודל המנסח" value={writerModel} onChange={(event) => onWriter(event.target.value)} />
      )}
      <Button type="button" variant="secondary" disabled={!text.trim() || (mode === 'template' && unknownNames(text, columns).length > 0)} onClick={onSample}>
        {mode === 'ai' || rephrase ? 'הצג כיוון ניסוח' : 'הצג דוגמה'}
      </Button>
      {sample && (
        <div className="rounded-2xl border border-[var(--edge)] bg-[var(--glass-2)] px-4 py-3 text-sm whitespace-pre-wrap">
          {sample}
        </div>
      )}
      <input
        ref={mediaRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onMedia(file);
        }}
      />
      <Textarea
        label="תיאור המדיה"
        hint="תמונה ומסמך מתמלאים אחרי הניתוח. סרטון כותבים ידנית. לא נשלח ללקוח."
        value={mediaNote}
        onChange={(event) => onNote(event.target.value)}
      />
      <Button type="button" variant="secondary" onClick={onPickMedia}>
        {mediaName || 'צרפו קובץ אחד, לא חובה'}
      </Button>
    </div>
  );
}

function ColumnTokens({ columns, text, onInsert }: { columns: string[]; text: string; onInsert: (name: string) => void }) {
  const used = usedNames(text);
  const missing = unknownNames(text, columns);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {columns.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onInsert(name)}
            className="rounded-full border border-[var(--edge)] bg-[var(--glass-2)] px-3 py-1 text-xs text-[var(--ink)]"
          >
            {name}
          </button>
        ))}
        {columns.length === 0 && <p className="text-xs text-[var(--text-muted)]">אין עמודות מלבד הטלפון</p>}
      </div>
      {used.length > 0 && (
        <ul className="space-y-1 text-xs">
          {used.map((name) => (
            <li key={name} className={missing.includes(name) ? 'text-red-400' : 'text-emerald-500'}>
              {`{{${name}}}`} · {missing.includes(name) ? 'אין עמודה כזו' : 'קיים בקובץ'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModeButton({ on, label, hint, onClick }: { on: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-right ${on ? 'border-[var(--acc)] bg-[var(--glass-2)]' : 'border-[var(--edge)]'}`}
    >
      <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
      <span className="block text-xs text-[var(--text-muted)]">{hint}</span>
    </button>
  );
}

export function WhenStep(props: {
  hourly: string;
  daily: string;
  onHourly: (value: string) => void;
  onDaily: (value: string) => void;
  start: string;
  end: string;
  timezone: string;
  skipAmount: string;
  skipUnit: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onTimezone: (value: string) => void;
  onSkipAmount: (value: string) => void;
  onSkipUnit: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">בלי תקרה אי אפשר להתחיל. המספרים הם של הסוכן, לא של הקמפיין הזה בלבד.</p>
      <Input
        label="הודעות בשעה"
        inputMode="numeric"
        value={props.hourly}
        onChange={(event) => props.onHourly(digits(event.target.value, 4))}
      />
      <Input
        label="הודעות ביום"
        inputMode="numeric"
        value={props.daily}
        onChange={(event) => props.onDaily(digits(event.target.value, 5))}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="משעה" type="time" value={props.start} onChange={(event) => props.onStart(event.target.value)} />
        <Input label="עד שעה" type="time" value={props.end} onChange={(event) => props.onEnd(event.target.value)} />
      </div>
      <Select
        label="אזור זמן"
        value={props.timezone}
        options={TIMEZONES}
        onChange={(event) => props.onTimezone(event.target.value)}
      />
      <Input
        label="דלג אם דיבר לאחרונה"
        hint="רק מספר. ריק כדי לשלוח לכולם"
        inputMode="numeric"
        value={props.skipAmount}
        onChange={(event) => props.onSkipAmount(digits(event.target.value, 4))}
      />
      <Select
        label="יחידה"
        value={props.skipUnit}
        options={[
          { value: 'minutes', label: 'דקות' },
          { value: 'hours', label: 'שעות' },
          { value: 'days', label: 'ימים' },
        ]}
        onChange={(event) => props.onSkipUnit(event.target.value)}
      />
    </div>
  );
}

export function PreviewStep({
  preview, phone, onPhone, sent, busy, onSend, whenMode, whenAt, onWhenMode, onWhenAt,
}: {
  preview: string;
  phone: string;
  onPhone: (value: string) => void;
  sent: boolean;
  busy: boolean;
  onSend: () => void;
  whenMode: 'now' | 'later';
  whenAt: string;
  onWhenMode: (value: 'now' | 'later') => void;
  onWhenAt: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">זו שורה אחת מהקובץ. שליחה למספר שלך לא מקדמת את התור.</p>
      <div className="rounded-2xl border border-[var(--edge)] bg-[var(--glass-2)] px-4 py-3 text-sm whitespace-pre-wrap">
        {preview || 'אין טקסט להצגה'}
      </div>
      <Input label="המספר שלי" value={phone} onChange={(event) => onPhone(event.target.value)} placeholder="05…" />
      <Button type="button" variant="secondary" loading={busy} disabled={!phone.trim()} onClick={onSend}>
        שלח לי לבדיקה
      </Button>
      {sent && <p className="text-sm text-emerald-500">נשלח. ההודעה בשיחות של הסוכן, עם הסימון «קמפיין».</p>}
      <div className="grid grid-cols-2 gap-2">
        <ModeButton on={whenMode === 'now'} label="מיידי" hint="מתחיל ברגע שלוחצים" onClick={() => onWhenMode('now')} />
        <ModeButton on={whenMode === 'later'} label="בתאריך ושעה" hint="לפי אזור הזמן שנבחר" onClick={() => onWhenMode('later')} />
      </div>
      {whenMode === 'later' && (
        <Input label="מתי להתחיל" type="datetime-local" value={whenAt} onChange={(event) => onWhenAt(event.target.value)} />
      )}
    </div>
  );
}
