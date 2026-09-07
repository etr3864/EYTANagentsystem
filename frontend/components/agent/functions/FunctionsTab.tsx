'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import {
  createAgentFunction,
  deleteAgentFunction,
  listAgentFunctions,
  listFunctionAttention,
  patchAgentFunction,
  resolveFunctionAttention,
  testAgentFunction,
  updateAgentFunction,
  type FunctionAttention,
} from '@/lib/agentFunctions';
import { EMPTY_FUNCTION, toUpsert, type AgentFunction, type FunctionTestResult, type FunctionUpsert } from '@/lib/agentFunctionTypes';
import { FunctionEditor } from './FunctionEditor';
import { FunctionTestPanel } from './FunctionTestPanel';
import { FunctionAttentionList } from './FunctionAttentionList';

export function FunctionsTab({ agentId }: { agentId: number }) {
  const [items, setItems] = useState<AgentFunction[]>([]);
  const [attention, setAttention] = useState<FunctionAttention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentFunction | null>(null);
  const [draft, setDraft] = useState<FunctionUpsert>(EMPTY_FUNCTION);
  const [creating, setCreating] = useState(false);
  const [sampleValues, setSampleValues] = useState('{}');
  const [testResult, setTestResult] = useState<FunctionTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [fns, pending] = await Promise.all([
        listAgentFunctions(agentId),
        listFunctionAttention(agentId),
      ]);
      setItems(fns);
      setAttention(pending);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { reload(); }, [reload]);

  const openNew = () => {
    setCreating(true);
    setEditing(null);
    setDraft({ ...EMPTY_FUNCTION });
    setTestResult(null);
  };

  const openEdit = (item: AgentFunction) => {
    setCreating(false);
    setEditing(item);
    setDraft(toUpsert(item));
    setTestResult(null);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
    setTestResult(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...draft, body_template: ['POST', 'PUT', 'PATCH'].includes(draft.method) ? draft.body_template : null };
      if (creating) {
        const created = await createAgentFunction(agentId, payload);
        setEditing(created);
        setCreating(false);
        setDraft(toUpsert(created));
      } else if (editing) {
        const updated = await updateAgentFunction(agentId, editing.id, payload);
        setEditing(updated);
        setDraft(toUpsert(updated));
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setBusy(false);
    }
  };

  const resolveAttention = async (id: number, action: 'done' | 'retry') => {
    try {
      await resolveFunctionAttention(agentId, id, action);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לעדכן');
    }
  };

  const toggle = async (item: AgentFunction) => {
    try {
      await patchAgentFunction(agentId, item.id, { enabled: !item.enabled });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן להפעיל');
    }
  };

  const remove = async (item: AgentFunction) => {
    if (!confirm(`למחוק את ${item.name}?`)) return;
    await deleteAgentFunction(agentId, item.id);
    if (editing?.id === item.id) close();
    await reload();
  };

  const runTest = async (live: boolean) => {
    if (!editing) {
      setError('שמור קודם ואז בדוק');
      return;
    }
    let values: Record<string, string> = {};
    try {
      values = JSON.parse(sampleValues || '{}');
    } catch {
      setError('ערכי בדיקה חייבים JSON');
      return;
    }
    setBusy(true);
    try {
      await save();
      const result = await testAgentFunction(agentId, editing.id, live, values);
      setTestResult(result);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הבדיקה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const showEditor = creating || editing;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-white">פונקציות API</h2>
        <Button size="sm" onClick={openNew}>פונקציה חדשה</Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <FunctionAttentionList
        items={attention}
        onDone={(id) => resolveAttention(id, 'done')}
        onRetry={(id) => resolveAttention(id, 'retry')}
      />
      {loading && <p className="text-slate-400 text-sm">טוען…</p>}
      {!loading && items.length === 0 && !showEditor && (
        <p className="text-slate-400 text-sm">אין פונקציות. פונקציה פעילה עם טריגר שיחה רצה בשיחות אחרי טסט.</p>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="text-right flex-1" onClick={() => openEdit(item)}>
                <CardHeader>{item.name}</CardHeader>
                <p className="text-xs text-slate-400">{item.method} {item.allowed_host} · {item.trigger}</p>
              </button>
              <label className="text-xs text-slate-400 flex items-center gap-2">
                <input type="checkbox" checked={item.enabled} disabled={!item.can_enable && !item.enabled} onChange={() => toggle(item)} />
                פעיל
              </label>
              <Button variant="secondary" size="sm" onClick={() => remove(item)}>מחק</Button>
            </div>
          </Card>
        ))}
      </div>
      {showEditor && (
        <Card>
          <CardHeader>{creating ? 'פונקציה חדשה' : editing?.name}</CardHeader>
          <FunctionEditor value={draft} onChange={setDraft} error={null} />
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">ערכי בדיקה (JSON) — למשל {`{"phone":"97250..."}`}</p>
            <textarea
              className="w-full bg-white/[0.04] border border-purple-500/10 rounded-lg p-2 text-sm text-white font-mono text-left"
              dir="ltr"
              rows={3}
              value={sampleValues}
              onChange={(e) => setSampleValues(e.target.value)}
            />
            <FunctionTestPanel
              result={testResult}
              busy={busy || creating}
              onDry={() => runTest(false)}
              onLive={() => {
                if (confirm('יישלח ל-API האמיתי. ממשיכים?')) runTest(true);
              }}
            />
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>שמור</Button>
              <Button variant="secondary" onClick={close}>סגור</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
