'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import {
  AgentStep,
  FileStep,
  MessageStep,
  PreviewStep,
  WhenStep,
  canContinue,
} from '@/components/campaigns/WizardSteps';
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
  setCampaignCaps,
  testSend,
  uploadAudience,
  uploadCampaignMedia,
} from '@/lib/api/campaigns';

const STEPS = ['סוכן', 'קובץ', 'הודעה', 'מתי', 'בדיקה'];

const ERRORS: Record<string, string> = {
  flag: 'המתג של הסוכן כבוי',
  session: 'אין סשן מחובר',
  caps: 'חסרה תקרה שעתית או יומית',
  unknown_column: 'יש משתנה בלי עמודה בקובץ',
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
  const [writerModel, setWriterModel] = useState('gemini-3.8-flash');
  const [rephrase, setRephrase] = useState(false);
  const [sample, setSample] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [mediaNote, setMediaNote] = useState('');
  const [hourly, setHourly] = useState('');
  const [daily, setDaily] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [timezone, setTimezone] = useState('Asia/Jerusalem');
  const [skipAmount, setSkipAmount] = useState('');
  const [skipUnit, setSkipUnit] = useState('days');
  const [preview, setPreview] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [sentTest, setSentTest] = useState(false);
  const [whenMode, setWhenMode] = useState<'now' | 'later'>('now');
  const [whenAt, setWhenAt] = useState('');

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setError('לא הצלחנו לטעון סוכנים'));
  }, []);

  const flagged = agents.filter((agent) => agent.campaigns_enabled && agent.name.includes(query.trim()));
  const fieldColumns = headers.filter((header) => header !== phoneColumn);

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
            columns={fieldColumns}
            writerModel={writerModel}
            onWriter={setWriterModel}
            rephrase={rephrase}
            onRephrase={setRephrase}
            sample={sample}
            onSample={() => run(showSample)}
            mediaRef={mediaRef}
            mediaName={mediaName}
            mediaNote={mediaNote}
            onNote={setMediaNote}
            onPickMedia={() => mediaRef.current?.click()}
            onMedia={(file) => run(async () => {
              if (!campaignId) return;
              const stored = await uploadCampaignMedia(campaignId, file, mediaNote);
              setMediaName(file.name);
              if (stored.kind !== 'video') setMediaNote(stored.description);
            })}
          />
        )}
        {step === 3 && (
          <WhenStep
            hourly={hourly}
            daily={daily}
            onHourly={setHourly}
            onDaily={setDaily}
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
            whenMode={whenMode}
            whenAt={whenAt}
            onWhenMode={setWhenMode}
            onWhenAt={setWhenAt}
          />
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="ghost" disabled={busy || step === 0} onClick={() => setStep((current) => current - 1)}>
            חזרה
          </Button>
          {step < 4 ? (
            <Button loading={busy} disabled={!canContinue(step, { agentId, name, importId, phoneColumn, text, hourly, daily, mode, columns: fieldColumns })} onClick={() => run(() => advance())}>
              המשך
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={whenMode === 'later' && !whenAt}
              onClick={() => run(startCampaign)}
            >
              {whenMode === 'later' ? 'תזמן' : 'התחל עכשיו'}
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
      await patchCampaign(campaignId, {
        ...(mode === 'ai' ? { mode, prompt: text } : { mode, template_body: text }),
        rephrase_enabled: mode === 'template' && rephrase,
        writer_model: writerModel,
        rephrase_model: writerModel,
      });
      setStep(3);
      return;
    }
    if (step === 3 && campaignId) {
      await setCampaignCaps(Number(agentId), Number(hourly), Number(daily));
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

  async function showSample() {
    if (!campaignId) return;
    await patchCampaign(campaignId, {
      ...(mode === 'ai' ? { mode, prompt: text } : { mode, template_body: text }),
      rephrase_enabled: mode === 'template' && rephrase,
      writer_model: writerModel,
      rephrase_model: writerModel,
    });
    const shown = await previewCampaign(campaignId);
    setSample(shown.text);
  }

  async function sendTest() {
    if (!campaignId) return;
    await testSend(campaignId, testPhone.trim());
    setSentTest(true);
  }

  async function startCampaign() {
    if (!campaignId) return;
    await campaignAction(campaignId, 'start', whenMode === 'later' ? whenAt : undefined);
    router.push(`/campaigns/${campaignId}`);
  }
}
