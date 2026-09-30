'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { getAgents } from '@/lib/api/agents';
import type { Agent } from '@/lib/types';
import {
  commitAudience,
  createCampaign,
  dropDuplicates,
  audienceStatus,
  patchCampaign,
  previewCampaign,
  testSend,
  uploadAudience,
  uploadCampaignMedia,
  campaignAction,
} from '@/lib/api/campaigns';

export default function NewCampaignPage() {
  return (
    <AuthGuard>
      <Wizard />
    </AuthGuard>
  );
}

function Wizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [agentQuery, setAgentQuery] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState('');
  const [importId, setImportId] = useState<number | null>(null);
  const [dupes, setDupes] = useState(0);
  const [mode, setMode] = useState<'template' | 'ai'>('template');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [error, setError] = useState('');
  const matches = agents.filter((agent) => agent.campaigns_enabled && agent.name.includes(agentQuery));

  async function nextAgent() {
    const created = await createCampaign(Number(agentId), name);
    setCampaignId(created.id);
    setStep(2);
  }

  async function onFile(file: File) {
    if (!campaignId) return;
    const uploaded = await uploadAudience(campaignId, file);
    setHeaders(uploaded.headers);
    setImportId(uploaded.import_id);
    setPhoneColumn(uploaded.headers[0] || '');
  }

  async function loadFile() {
    if (!campaignId || !importId) return;
    await commitAudience(campaignId, importId, phoneColumn);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await audienceStatus(campaignId, importId);
      if (status.status === 'done') {
        setDupes(status.duplicates);
        setStep(3);
        return;
      }
      if (status.status === 'failed') throw new Error(status.error || 'ייבוא');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async function saveMessage() {
    if (!campaignId) return;
    const body = mode === 'ai'
      ? { mode, prompt: text }
      : { mode, template_body: text };
    await patchCampaign(campaignId, body);
    setStep(4);
  }

  async function saveWhen(form: FormData) {
    if (!campaignId) return;
    await patchCampaign(campaignId, {
      window_start: String(form.get('start') || ''),
      window_end: String(form.get('end') || ''),
      timezone: String(form.get('tz') || 'Asia/Jerusalem'),
      skip_recent_amount: Number(form.get('skip') || 0) || null,
      skip_recent_unit: String(form.get('unit') || 'days'),
    });
    const shown = await previewCampaign(campaignId);
    setPreview(shown.text);
    setStep(5);
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl">קמפיין חדש</h1>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {step === 1 && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); nextAgent().catch((err) => setError(err.message)); }}>
          <input className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" placeholder="חיפוש סוכן" value={agentQuery} onChange={(event) => { setAgentQuery(event.target.value); if (!agents.length) getAgents().then(setAgents).catch(() => undefined); }} />
          <ul className="max-h-40 overflow-auto text-sm">
            {matches.map((agent) => (
              <li key={agent.id}>
                <button type="button" className={agentId === String(agent.id) ? 'font-medium' : ''} onClick={() => setAgentId(String(agent.id))}>{agent.name}</button>
              </li>
            ))}
          </ul>
          <input className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" placeholder="שם הקמפיין" value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit" className="text-sm" disabled={!agentId || !name}>המשך</button>
        </form>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <input type="file" accept=".csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file).catch((err) => setError(err.message)); }} />
          {headers.length > 0 && (
            <select className="w-full bg-transparent border border-[var(--edge)] rounded-xl px-3 py-2 text-sm" value={phoneColumn} onChange={(event) => setPhoneColumn(event.target.value)}>
              {headers.map((header) => <option key={header}>{header}</option>)}
            </select>
          )}
          <button type="button" className="text-sm" onClick={() => loadFile().catch((err) => setError(err.message))}>טען</button>
        </div>
      )}
      {step === 3 && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); saveMessage().catch((err) => setError(err.message)); }}>
          {dupes > 0 && (
            <button type="button" className="text-sm" onClick={() => campaignId && dropDuplicates(campaignId).then(() => setDupes(0))}>
              הסר {dupes} כפילויות
            </button>
          )}
          <select className="bg-transparent" value={mode} onChange={(event) => setMode(event.target.value as 'template' | 'ai')}>
            <option value="template">תבנית</option>
            <option value="ai">ניסוח</option>
          </select>
          <textarea className="w-full min-h-32 bg-transparent border border-[var(--edge)] rounded-xl p-3 text-sm" value={text} onChange={(event) => setText(event.target.value)} />
          <input type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && campaignId) uploadCampaignMedia(campaignId, file, '').catch((err) => setError(err.message));
          }} />
          <button type="submit" className="text-sm">המשך</button>
        </form>
      )}
      {step === 4 && (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); saveWhen(new FormData(event.currentTarget)).catch((err) => setError(err.message)); }}>
          <input name="start" placeholder="09:00" className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" />
          <input name="end" placeholder="18:00" className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" />
          <input name="tz" defaultValue="Asia/Jerusalem" className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" />
          <input name="skip" placeholder="דלג אם דיבר ב" className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" />
          <button type="submit" className="text-sm">תצוגה</button>
        </form>
      )}
      {step === 5 && (
        <div className="space-y-3">
          <p className="text-sm whitespace-pre-wrap border border-[var(--edge)] rounded-xl p-3">{preview}</p>
          <input className="w-full border border-[var(--edge)] rounded-xl px-3 py-2 text-sm bg-transparent" placeholder="המספר שלי" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} />
          <button type="button" className="text-sm" onClick={() => campaignId && testSend(campaignId, testPhone).catch((err) => setError(err.message))}>שלח לי</button>
          <button type="button" className="text-sm" onClick={() => campaignId && campaignAction(campaignId, 'start').then(() => router.push(`/campaigns/${campaignId}`)).catch((err) => setError(err.message))}>התחל</button>
        </div>
      )}
    </main>
  );
}
