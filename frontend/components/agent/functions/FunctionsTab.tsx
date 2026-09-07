'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, CardHeader, ListPager } from '@/components/ui';
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
import { paginate } from '@/lib/pagination';
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
  const [page, setPage] = useState(1);

  const reload = useCallback(async (): Promise<AgentFunction[]> => {
    setLoading(true);
    try {
      const [fns, pending] = await Promise.all([
        listAgentFunctions(agentId),
        listFunctionAttention(agentId),
      ]);
      setItems(fns);
      setAttention(pending);
      setError(null);
      return fns;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      return [];
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

  const persist = async (): Promise<AgentFunction | null> => {
    const payload = { ...draft, body_template: ['POST', 'PUT', 'PATCH'].includes(draft.method) ? draft.body_template : null };
    if (creating) {
      const created = await createAgentFunction(agentId, payload);
      setEditing(created);
      setCreating(false);
      setDraft(toUpsert(created));
      return created;
    }
    if (editing) {
      const updated = await updateAgentFunction(agentId, editing.id, payload);
      setEditing(updated);
      setDraft(toUpsert(updated));
      return updated;
    }
    return null;
  };

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setSaveError(null);
    try {
      const row = await persist();
      if (!row) {
        setSaveError('אין מה לשמור');
        return false;
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
      const updated = await patchAgentFunction(agentId, item.id, { enabled: !item.enabled });
      await reload();
      if (editing?.id === item.id) {
        setEditing(updated);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'לא ניתן להפעיל';
      setSaveError(message);
      setError(message);
    }
  };

  const remove = async (item: AgentFunction) => {
    if (!confirm(`למחוק את ${item.name}?`)) return;
    await deleteAgentFunction(agentId, item.id);
    if (editing?.id === item.id) close();
    await reload();
  };

  const runTest = async (live: boolean) => {
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
      const saved = await persist();
      if (!saved) {
        setSaveError('שמור קודם ואז בדוק');
        return;
      }
      const result = await testAgentFunction(agentId, saved.id, live, values);
      setTestResult(result);
      const fns = await reload();
      const fresh = fns.find((item) => item.id === saved.id);
      if (fresh) setEditing(fresh);
      if (!result.ok) {
        setSaveError(result.error?.message_for_model || 'הבדיקה נכשלה — הפונקציה לא תופעל בשיחה');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'הבדיקה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const showEditor = creating || editing;
  const paged = paginate(items, page);

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
        {paged.items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <button type="button" className="text-right flex-1 min-w-0" onClick={() => openEdit(item)}>
                <CardHeader>{item.name}</CardHeader>
                <p className="text-xs text-slate-400">{item.method} {item.allowed_host} · {item.trigger}</p>
              </button>
              <EnableSwitch
                enabled={item.enabled}
                canEnable={item.can_enable}
                onToggle={() => toggle(item)}
              />
              <Button variant="secondary" size="sm" onClick={() => remove(item)}>מחק</Button>
            </div>
          </Card>
        ))}
        {items.length > 0 && (
          <ListPager
            page={paged.page}
            totalPages={paged.totalPages}
            from={paged.from}
            to={paged.to}
            total={paged.total}
            onPage={setPage}
          />
        )}
      </div>
      {showEditor && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <CardHeader>{creating ? 'פונקציה חדשה' : editing?.name}</CardHeader>
            {editing && (
              <EnableSwitch
                enabled={editing.enabled}
                canEnable={editing.can_enable}
                onToggle={() => toggle(editing)}
              />
            )}
          </div>
          {editing && !editing.can_enable && !editing.enabled && (
            <p className="text-sm text-amber-300 mb-4">
              {editing.side_effect === 'read' && !editing.test_was_live
                ? 'GET חייב בדיקה אמיתית מוצלחת לפני הפעלה — יבש לא מספיק.'
                : 'שמור, בדוק יבש, ואז שלח באמת. בלי טסט מוצלח אי אפשר להדליק.'}
            </p>
          )}
          {editing?.can_enable && !editing.enabled && (
            <p className="text-sm text-emerald-300 mb-4">הבדיקה עברה. אפשר להדליק את המתג.</p>
          )}
          <div className="space-y-3 mb-6 p-3 rounded-lg border border-purple-500/15 bg-white/[0.03]">
            <p className="text-sm text-slate-300">בדיקה — בלי זה הסוכן לא יריץ את הפונקציה בשיחה</p>
            <p className="text-xs text-slate-500">
              ערכי בדיקה לפרמטרים. JSON, למשל {`{"phone":"97250..."}`}. יבש = בלי רשת. שלח באמת = לכתובת למעלה.
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
          <FunctionEditor
            key={editing?.id ?? 'new'}
            value={draft}
            onChange={(next) => {
              setDraft(next);
              if (saveError) setSaveError(null);
            }}
            error={null}
          />
        </Card>
      )}
    </div>
  );
}

function EnableSwitch({
  enabled,
  canEnable,
  onToggle,
}: {
  enabled: boolean;
  canEnable: boolean;
  onToggle: () => void;
}) {
  const blocked = !enabled && !canEnable;
  return (
    <div className={`flex items-center gap-2 shrink-0 ${blocked ? 'opacity-50' : ''}`}>
      <span className="text-sm text-slate-300">{enabled ? 'פעיל' : 'כבוי'}</span>
      <button
        type="button"
        dir="ltr"
        disabled={blocked}
        title={blocked ? 'צריך בדיקה אמיתית מוצלחת לפני הפעלה' : enabled ? 'לחץ לכיבוי' : 'לחץ להפעלה'}
        onClick={onToggle}
        className={`w-11 h-6 rounded-full transition-colors relative ${
          blocked ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
