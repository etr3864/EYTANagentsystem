'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
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

  useEffect(() => {
    if (saveError) {
      saveErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [saveError]);

  const openNew = () => {
    setCreating(true);
    setEditing(null);
    setDraft({ ...EMPTY_FUNCTION });
    setTestResult(null);
    setSaveError(null);
  };

  const openEdit = (item: AgentFunction) => {
    setCreating(false);
    setEditing(item);
    setDraft(toUpsert(item));
    setTestResult(null);
    setSaveError(null);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
    setTestResult(null);
    setSaveError(null);
  };

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setSaveError(null);
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
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה');
      return false;
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
      setSaveError('שמור קודם ואז בדוק');
      return;
    }
    let values: Record<string, string> = {};
    try {
      values = JSON.parse(sampleValues || '{}');
    } catch {
      setSaveError('ערכי בדיקה חייבים JSON תקין, למשל {"phone":"97250..."}');
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const ok = await save();
      if (!ok) return;
      const result = await testAgentFunction(agentId, editing.id, live, values);
      setTestResult(result);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'הבדיקה נכשלה');
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
          <FunctionEditor
            key={editing?.id ?? 'new'}
            value={draft}
            onChange={(next) => {
              setDraft(next);
              if (saveError) setSaveError(null);
            }}
            error={null}
          />
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-400">
              ערכי בדיקה לפרמטרים שהבוט היה שואל. JSON באנגלית, למשל {`{"phone":"97250..."}`}. יבש = בלי לשלוח. שלח באמת = ל-API החי.
            </p>
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
            {saveError && (
              <p ref={saveErrorRef} role="alert" className="text-sm text-red-400 whitespace-pre-wrap">
                {saveError}
              </p>
            )}
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
