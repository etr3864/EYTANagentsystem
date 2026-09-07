'use client';

import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/Input';
import type { AgentFunctionParam, AgentFunctionOutput, FunctionUpsert, ParamSource } from '@/lib/agentFunctionTypes';
import { prettyJsonPreservingVars } from '@/lib/agentFunctions';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SOURCES: { id: ParamSource; label: string }[] = [
  { id: 'ask', label: 'מהלקוח' },
  { id: 'user.phone', label: 'טלפון משתמש' },
  { id: 'user.name', label: 'שם משתמש' },
  { id: 'saved', label: 'שמור מפונקציה' },
  { id: 'event', label: 'מאירוע' },
  { id: 'conversation.summary', label: 'סיכום שיחה' },
];

export function FunctionEditor({
  value,
  onChange,
  error,
}: {
  value: FunctionUpsert;
  onChange: (next: FunctionUpsert) => void;
  error: string | null;
}) {
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(value.method);
  const set = (patch: Partial<FunctionUpsert>) => onChange({ ...value, ...patch });

  const formatBody = () => {
    if (!value.body_template) return;
    try {
      set({ body_template: prettyJsonPreservingVars(value.body_template) });
    } catch {
      set({ body_template: value.body_template });
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="שם באנגלית" value={value.name} onChange={(e) => set({ name: e.target.value })} />
        <Select
          label="שיטה"
          value={value.method}
          onChange={(e) => set({ method: e.target.value })}
          options={METHODS.map((m) => ({ value: m, label: m }))}
        />
        <Select
          label="סוג"
          value={value.side_effect}
          onChange={(e) => set({ side_effect: e.target.value as 'read' | 'write' })}
          options={[
            { value: 'read', label: 'קריאה' },
            { value: 'write', label: 'כתיבה' },
          ]}
        />
        <Select
          label="טריגר"
          value={value.trigger}
          onChange={(e) => set({ trigger: e.target.value as 'conversation' | 'event' })}
          options={[
            { value: 'conversation', label: 'בשיחה' },
            { value: 'event', label: 'אחרי אירוע' },
          ]}
        />
      </div>
      {value.trigger === 'event' && (
        <Input label="סוג אירוע" value={value.event_type || ''} onChange={(e) => set({ event_type: e.target.value || null })} placeholder="appointment.booked" />
      )}
      <Textarea label="מתי להשתמש" value={value.when_to_use} onChange={(e) => set({ when_to_use: e.target.value })} rows={3} />
      <Textarea label="מתי לא להשתמש" value={value.when_not_to_use} onChange={(e) => set({ when_not_to_use: e.target.value })} rows={2} />
      <Input label="כתובת HTTPS" value={value.url} onChange={(e) => set({ url: e.target.value })} />
      <ParamsEditor params={value.params} onChange={(params) => set({ params })} />
      <HeadersEditor headers={value.headers} onChange={(headers) => set({ headers })} />
      {hasBody && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-slate-300">Body JSON</span>
            <button type="button" className="text-xs text-purple-300" onClick={formatBody}>סדר JSON</button>
          </div>
          <Textarea value={value.body_template || '{}'} onChange={(e) => set({ body_template: e.target.value })} rows={6} className="font-mono text-sm" />
        </div>
      )}
      <OutputsEditor outputs={value.outputs} onChange={(outputs) => set({ outputs })} />
      <Textarea label="איך להציג ללקוח" value={value.response_instructions} onChange={(e) => set({ response_instructions: e.target.value })} rows={2} />
    </div>
  );
}

function ParamsEditor({
  params,
  onChange,
}: {
  params: AgentFunctionParam[];
  onChange: (params: AgentFunctionParam[]) => void;
}) {
  const add = () => onChange([...params, { name: '', type: 'string', required: true, description: '', source: 'ask' }]);
  const update = (index: number, patch: Partial<AgentFunctionParam>) => {
    onChange(params.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-slate-300">פרמטרים</span>
        <button type="button" className="text-xs text-purple-300" onClick={add}>+ הוסף</button>
      </div>
      {params.map((param, index) => (
        <div key={index} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <Input placeholder="name" value={param.name} onChange={(e) => update(index, { name: e.target.value })} />
          <Select
            value={param.source}
            onChange={(e) => update(index, { source: e.target.value as ParamSource })}
            options={SOURCES.map((s) => ({ value: s.id, label: s.label }))}
          />
          {param.source === 'saved' && (
            <Input placeholder="crm_id" value={param.source_key || ''} onChange={(e) => update(index, { source_key: e.target.value })} />
          )}
          <Input placeholder="תיאור לבוט" value={param.description} onChange={(e) => update(index, { description: e.target.value })} />
          <label className="text-xs text-slate-400 flex items-center gap-1">
            <input type="checkbox" checked={param.required} onChange={(e) => update(index, { required: e.target.checked })} />
            חובה
          </label>
          <Button variant="ghost" size="sm" onClick={() => onChange(params.filter((_, i) => i !== index))}>הסר</Button>
        </div>
      ))}
    </div>
  );
}

function HeadersEditor({
  headers,
  onChange,
}: {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}) {
  const rows = Object.entries(headers);
  const setRow = (index: number, key: string, value: string) => {
    const next = { ...headers };
    const oldKey = rows[index]?.[0];
    if (oldKey) delete next[oldKey];
    if (key) next[key] = value;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-slate-300">Headers / טוקן</span>
        <button type="button" className="text-xs text-purple-300" onClick={() => onChange({ ...headers, Authorization: headers.Authorization || '' })}>+ הוסף</button>
      </div>
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="grid grid-cols-2 gap-2">
          <Input placeholder="Key" value={key} onChange={(e) => setRow(index, e.target.value, value)} />
          <Input placeholder="Bearer …" value={value} onChange={(e) => setRow(index, key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function OutputsEditor({
  outputs,
  onChange,
}: {
  outputs: AgentFunctionOutput[];
  onChange: (outputs: AgentFunctionOutput[]) => void;
}) {
  const add = () => onChange([...outputs, { json_path: 'id', save_as: '', scope: 'user' }]);
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-slate-300">פלטים לשמירה</span>
        <button type="button" className="text-xs text-purple-300" onClick={add}>+ הוסף</button>
      </div>
      {outputs.map((item, index) => (
        <div key={index} className="grid grid-cols-3 gap-2">
          <Input placeholder="json path" value={item.json_path} onChange={(e) => onChange(outputs.map((o, i) => i === index ? { ...o, json_path: e.target.value } : o))} />
          <Input placeholder="save as" value={item.save_as} onChange={(e) => onChange(outputs.map((o, i) => i === index ? { ...o, save_as: e.target.value } : o))} />
          <Select
            value={item.scope}
            onChange={(e) => onChange(outputs.map((o, i) => i === index ? { ...o, scope: e.target.value as 'user' | 'conversation' } : o))}
            options={[
              { value: 'user', label: 'לקוח' },
              { value: 'conversation', label: 'שיחה' },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
