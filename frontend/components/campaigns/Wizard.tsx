'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { getAgents } from '@/lib/api/agents';
import type { Agent } from '@/lib/types';
import {
  audienceStatus,
  campaignAction,
  commitAudience,
  createCampaign,
  dropDuplicates,
  patchCampaign,
  previewCampaign,
  testSend,
  uploadAudience,
  uploadCampaignMedia,
} from '@/lib/api/campaigns';

const STEPS = ['סוכן', 'קובץ', 'הודעה', 'מתי', 'בדיקה'];

const ERRORS: Record<string, string> = {
  flag: 'המתג של הסוכן כבוי',
  session: 'אין סשן מחובר',
  caps: 'חסרה תקרה שעתית או יומית',
  phone: 'מספר לא תקין',
  audience: 'אין נמענים בקובץ',
  video_description: 'לסרטון צריך תיאור קצר',
  too_large: 'הקובץ גדול מדי',
  type: 'סוג הקובץ לא נתמך',
  csv_or_xlsx: 'רק קובץ csv או xlsx',
  phone_column: 'בחרו את עמודת הטלפון',
  busy: 'יש שליחה פתוחה, נסו שוב עוד רגע',
  send: 'השליחה לא יצאה',
};

export function Wizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState('');
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [importId, setImportId] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [dupes, setDupes] = useState(0);
  const [mode, setMode] = useState<'template' | 'ai'>('template');
  const [text, setText] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [mediaNote, setMediaNote] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [timezone, setTimezone] = useState('Asia/Jerusalem');
  const [skipAmount, setSkipAmount] = useState('');
  const [skipUnit, setSkipUnit] = useState('days');
  const [preview, setPreview] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [sentTest, setSentTest] = useState(false);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setError('לא הצלחנו לטעון סוכנים'));
  }, []);

  const flagged = agents.filter((agent) => agent.campaigns_enabled && agent.name.includes(query.trim()));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'שגיאה';
      setError(ERRORS[raw] || raw);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-6 md:px-6">
      <div>
        <Link href="/campaigns" className="text-xs text-[var(--text-muted)]">קמפיינים</Link>
        <h1 className="text-2xl font-bold text-[var(--ink)]">קמפיין חדש</h1>
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              index === step
                ? 'bg-[var(--ink)] text-[var(--bg)]'
                : index < step
                  ? 'border border-[var(--edge)] bg-[var(--glass-2)] text-[var(--ink)]'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <Card padding="lg" className="space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {step === 0 && (
          <AgentStep
            query={query}
            onQuery={setQuery}
            agents={flagged}
            agentId={agentId}
            onAgent={setAgentId}
            name={name}
            onName={setName}
          />
        )}
        {step === 1 && (
          <FileStep
            fileRef={fileRef}
            fileName={fileName}
            headers={headers}
            phoneColumn={phoneColumn}
            onColumn={setPhoneColumn}
            onPick={() => fileRef.current?.click()}
            onFile={(file) => run(async () => {
              if (!campaignId) return;
              const uploaded = await uploadAudience(campaignId, file);
              setFileName(file.name);
              setHeaders(uploaded.headers);
              setImportId(uploaded.import_id);
              setPhoneColumn(uploaded.headers[0] || '');
            })}
          />
        )}
        {step === 2 && (
          <MessageStep
            dupes={dupes}
            onDropDupes={() => run(async () => {
              if (!campaignId) return;
              await dropDuplicates(campaignId);
              setDupes(0);
            })}
            mode={mode}
            onMode={setMode}
            text={text}
            onText={setText}
            mediaRef={mediaRef}
            mediaName={mediaName}
            mediaNote={mediaNote}
            onNote={setMediaNote}
            onPickMedia={() => mediaRef.current?.click()}
            onMedia={(file) => run(async () => {
              if (!campaignId) return;
              await uploadCampaignMedia(campaignId, file, mediaNote);
              setMediaName(file.name);
            })}
          />
        )}
        {step === 3 && (
          <WhenStep
            start={start}
            end={end}
            timezone={timezone}
            skipAmount={skipAmount}
            skipUnit={skipUnit}
            onStart={setStart}
            onEnd={setEnd}
            onTimezone={setTimezone}
            onSkipAmount={setSkipAmount}
            onSkipUnit={setSkipUnit}
          />
        )}
        {step === 4 && (
          <PreviewStep
            preview={preview}
            phone={testPhone}
            onPhone={setTestPhone}
            sent={sentTest}
            busy={busy}
            onSend={() => run(sendTest)}
          />
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="ghost" disabled={busy || step === 0} onClick={() => setStep((current) => current - 1)}>
            חזרה
          </Button>
          {step < 4 ? (
            <Button loading={busy} disabled={!canContinue(step, { agentId, name, importId, phoneColumn, text })} onClick={() => run(() => advance())}>
              המשך
            </Button>
          ) : (
            <Button loading={busy} onClick={() => run(startCampaign)}>
              התחל קמפיין
            </Button>
          )}
        </div>
      </Card>
    </main>
  );

  async function advance() {
    if (step === 0) {
      if (!campaignId) {
        const created = await createCampaign(Number(agentId), name.trim());
        setCampaignId(created.id);
      }
      setStep(1);
      return;
    }
    if (step === 1 && campaignId && importId) {
      await commitAudience(campaignId, importId, phoneColumn);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await audienceStatus(campaignId, importId);
        if (status.status === 'done') {
          setDupes(status.duplicates);
          setStep(2);
          return;
        }
        if (status.status === 'failed') throw new Error(status.error || 'ייבוא');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error('הטעינה לקחה יותר מדי זמן');
    }
    if (step === 2 && campaignId) {
      await patchCampaign(campaignId, mode === 'ai' ? { mode, prompt: text } : { mode, template_body: text });
      setStep(3);
      return;
    }
    if (step === 3 && campaignId) {
      await patchCampaign(campaignId, {
        window_start: start,
        window_end: end,
        timezone,
        skip_recent_amount: Number(skipAmount) || null,
        skip_recent_unit: skipUnit,
      });
      const shown = await previewCampaign(campaignId);
      setPreview(shown.text);
      setStep(4);
    }
  }

  async function sendTest() {
    if (!campaignId) return;
    await testSend(campaignId, testPhone.trim());
    setSentTest(true);
  }

  async function startCampaign() {
    if (!campaignId) return;
    await campaignAction(campaignId, 'start');
    router.push(`/campaigns/${campaignId}`);
  }
}

function canContinue(step: number, fields: { agentId: string; name: string; importId: number | null; phoneColumn: string; text: string }) {
  if (step === 0) return Boolean(fields.agentId && fields.name.trim());
  if (step === 1) return Boolean(fields.importId && fields.phoneColumn);
  if (step === 2) return Boolean(fields.text.trim());
  return true;
}

function AgentStep({
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

function FileStep({
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

function MessageStep({
  dupes, onDropDupes, mode, onMode, text, onText, mediaRef, mediaName, mediaNote, onNote, onPickMedia, onMedia,
}: {
  dupes: number;
  onDropDupes: () => void;
  mode: 'template' | 'ai';
  onMode: (mode: 'template' | 'ai') => void;
  text: string;
  onText: (value: string) => void;
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
        hint={mode === 'template' ? 'עמודה ריקה מקבלת ברירת מחדל רק אם הגדרתם אחת' : 'תא ריק לא יימסר, ואין להמציא אותו'}
        value={text}
        onChange={(event) => onText(event.target.value)}
      />
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
      <Input label="תיאור מדיה" hint="חובה לסרטון. לא נשלח ללקוח." value={mediaNote} onChange={(event) => onNote(event.target.value)} />
      <Button type="button" variant="secondary" onClick={onPickMedia}>
        {mediaName || 'צרפו קובץ אחד, לא חובה'}
      </Button>
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

function WhenStep(props: {
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
      <p className="text-sm text-[var(--text-secondary)]">מחוץ לשעות האלה לא נשלח כלום. מה שמחכה נפרס כשהחלון נפתח.</p>
      <div className="grid grid-cols-2 gap-3">
        <Input label="משעה" value={props.start} onChange={(event) => props.onStart(event.target.value)} />
        <Input label="עד שעה" value={props.end} onChange={(event) => props.onEnd(event.target.value)} />
      </div>
      <Input label="אזור זמן" value={props.timezone} onChange={(event) => props.onTimezone(event.target.value)} />
      <div className="grid grid-cols-[1fr_8rem] gap-3 items-end">
        <Input
          label="דלג אם דיבר לאחרונה"
          hint="השאירו ריק כדי לשלוח לכולם"
          value={props.skipAmount}
          onChange={(event) => props.onSkipAmount(event.target.value)}
          inputMode="numeric"
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
    </div>
  );
}

function PreviewStep({
  preview, phone, onPhone, sent, busy, onSend,
}: {
  preview: string;
  phone: string;
  onPhone: (value: string) => void;
  sent: boolean;
  busy: boolean;
  onSend: () => void;
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
      {sent && <p className="text-sm text-emerald-500">נשלח. בדקו את הוואטסאפ לפני שמתחילים.</p>}
    </div>
  );
}
