'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/Input';
import type { AgentFunctionParam, AgentFunctionOutput, FunctionUpsert, ParamSource } from '@/lib/agentFunctionTypes';
import { EVENT_TYPE_OPTIONS } from '@/lib/agentFunctionTypes';
import { extractTemplateVars, mergeParamsFromVars, prettyJsonPreservingVars } from '@/lib/agentFunctions';

const LTR = 'text-left font-mono text-sm';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const SOURCES: { id: ParamSource; label: string }[] = [
  { id: 'ask', label: 'לשאול את הלקוח' },
  { id: 'user.phone', label: 'טלפון הלקוח' },
  { id: 'user.name', label: 'שם הלקוח' },
  { id: 'saved', label: 'ערך שנשמר מפונקציה' },
  { id: 'event', label: 'מהאירוע' },
  { id: 'conversation.summary', label: 'סיכום שיחה' },
];

function sideEffectForMethod(method: string): 'read' | 'write' {
  return WRITE_METHODS.has(method) ? 'write' : 'read';
}

function extraHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  delete next.Authorization;
  return next;
}

function joinHeaders(token: string, extra: Record<string, string>): Record<string, string> {
  const next = { ...extra };
  const trimmed = token.trim();
  if (trimmed) next.Authorization = trimmed;
  else delete next.Authorization;
  return next;
}

function hasAdvanced(value: FunctionUpsert): boolean {
  const extras = extraHeaders(value.headers);
  return Boolean(
    value.when_not_to_use
    || value.response_instructions
    || value.trigger === 'event'
    || value.outputs.length > 0
    || Object.keys(extras).length > 0
    || value.params.some((param) => param.source !== 'ask' || param.description || param.source_key || param.required === false)
    || value.side_effect !== sideEffectForMethod(value.method),
  );
}

export function FunctionEditor({
  value,
  onChange,
  error,
}: {
  value: FunctionUpsert;
  onChange: (next: FunctionUpsert) => void;
  error: string | null;
}) {
  const hasBody = WRITE_METHODS.has(value.method);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvanced(value));
  const templateVars = extractTemplateVars(
    value.url,
    hasBody ? value.body_template : null,
  );

  const set = (patch: Partial<FunctionUpsert>) => {
    const next = { ...value, ...patch };
    const nextHasBody = WRITE_METHODS.has(next.method);
    next.params = mergeParamsFromVars(
      next.params,
      extractTemplateVars(next.url, nextHasBody ? next.body_template : null),
    );
    onChange(next);
  };

  const formatBody = () => {
    if (!value.body_template) return;
    try {
      set({ body_template: prettyJsonPreservingVars(value.body_template) });
      setJsonError(null);
    } catch {
      setJsonError('JSON לא תקין — תקן ואז לחץ שוב');
    }
  };

  const paramNames = value.params.map((param) => param.name).filter(Boolean);
  const token = value.headers.Authorization || '';

  return (
    <div className="space-y-5 min-w-0">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-sm text-slate-400">
        שמור, בדוק יבש ואז אמיתי, ורק אז הפעל.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="שם הפונקציה (אנגלית)"
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          dir="ltr"
          className={LTR}
          hint="אותיות ומקף תחתון בלבד, בלי רווחים. למשל create_lead"
        />
        <Select
          label="שיטת HTTP"
          value={value.method}
          onChange={(e) => {
            const method = e.target.value;
            set({ method, side_effect: sideEffectForMethod(method) });
          }}
          options={METHODS.map((m) => ({ value: m, label: m }))}
          dir="ltr"
          hint="GET לשליפה. POST/PUT/PATCH ליצירה או עדכון — אז מופיע גוף JSON."
        />
      </div>

      <Textarea
        label="מתי להשתמש"
        value={value.when_to_use}
        onChange={(e) => set({ when_to_use: e.target.value })}
        rows={3}
        hint="הנחיה לבוט בשפה טבעית, לא קוד. למשל: כשלקוח רוצה להשאיר פרטים לקראת חזרה."
      />
      <Input
        label="כתובת HTTPS"
        value={value.url}
        onChange={(e) => set({ url: e.target.value })}
        dir="ltr"
        className={LTR}
        placeholder="https://example.com/api/leads"
        hint={'רק https. אפשר {{phone}} בנתיב — נוצר פרמטר אוטומטית.'}
      />
      <Input
        label="טוקן"
        value={token}
        onChange={(e) => set({ headers: joinHeaders(e.target.value, extraHeaders(value.headers)) })}
        dir="ltr"
        className={LTR}
        placeholder="Bearer …"
        hint={token.startsWith('...')
          ? 'הטוקן שמור. השאר כך כדי לא לדרוס, או הדבק טוקן חדש.'
          : 'נשלח כ-Authorization. כולל Bearer. מוצפן אחרי שמירה.'}
      />

      {hasBody && (
        <div className="space-y-2 rounded-lg border border-purple-500/10 p-3">
          <div>
            <p className="text-sm font-medium text-white">גוף הבקשה (JSON)</p>
            <p className="text-xs text-slate-500 mt-1">
              {'{{phone}}'} בערך הופך לפרמטר. «סדר JSON» רק מעצב.
            </p>
          </div>
          <Textarea
            value={value.body_template || '{}'}
            onChange={(e) => {
              setJsonError(null);
              set({ body_template: e.target.value });
            }}
            rows={8}
            dir="ltr"
            className={`${LTR} min-h-[160px]`}
          />
          <Button type="button" variant="secondary" size="sm" onClick={formatBody}>
            סדר JSON
          </Button>
          {jsonError && <p className="text-sm text-red-400">{jsonError}</p>}
        </div>
      )}

      {paramNames.length > 0 && (
        <p className="text-xs text-slate-500">
          פרמטרים: {paramNames.join(', ')}. ברירת מחדל — הבוט שואל. מקור אחר במתקדם.
        </p>
      )}

      <div className="rounded-lg border border-purple-500/10 p-3">
        <button
          type="button"
          className="text-sm font-medium text-white"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? 'הסתר מתקדם' : 'הצג מתקדם'}
        </button>
        {advancedOpen && (
          <>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          מתי לא להשתמש, מקורות פרמטר, שמירת פלט, headers נוספים, טריגר אירוע.
        </p>
        <div className="space-y-5">
          <Select
            label="סוג פעולה"
            value={value.side_effect}
            onChange={(e) => set({ side_effect: e.target.value as 'read' | 'write' })}
            options={[
              { value: 'read', label: 'קריאה — לא משנה כלום אצל הלקוח' },
              { value: 'write', label: 'כתיבה — יוצר/מעדכן משהו' },
            ]}
            hint="ברירת מחדל לפי השיטה (GET=קריאה, POST=כתיבה). אפשר לדרוס."
          />
          <Select
            label="מתי זה רץ"
            value={value.trigger}
            onChange={(e) => {
              const trigger = e.target.value as 'conversation' | 'event';
              set({
                trigger,
                event_type: trigger === 'event' ? (value.event_type || 'appointment.created') : null,
              });
            }}
            options={[
              { value: 'conversation', label: 'בשיחה — הבוט קורא כשצריך' },
              { value: 'event', label: 'אחרי אירוע במערכת' },
            ]}
            hint="בשיחה = עובד עכשיו. אחרי אירוע = נשמר להגדרה, עדיין לא רץ אוטומטית."
          />
          {value.trigger === 'event' && (
            <EventTypeSelect value={value} onChange={set} />
          )}
          <Textarea
            label="מתי לא להשתמש"
            value={value.when_not_to_use}
            onChange={(e) => set({ when_not_to_use: e.target.value })}
            rows={2}
            hint="אופציונלי. למשל: אל תקרא אם כבר יש ליד פתוח, או אם הלקוח רק שואל מחיר."
          />
          <Textarea
            label="איך להציג ללקוח"
            value={value.response_instructions}
            onChange={(e) => set({ response_instructions: e.target.value })}
            rows={2}
            hint="הנחיה לבוט בשפה טבעית אחרי הצלחה — לא משפט שייקריא מילה במילה."
          />
          <ParamsEditor
            params={value.params}
            lockedNames={templateVars}
            onChange={(params) => set({ params })}
          />
          <HeadersEditor
            headers={extraHeaders(value.headers)}
            onChange={(extra) => set({ headers: joinHeaders(token, extra) })}
          />
          <OutputsEditor outputs={value.outputs} onChange={(outputs) => set({ outputs })} />
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function EventTypeSelect({
  value,
  onChange,
}: {
  value: FunctionUpsert;
  onChange: (patch: Partial<FunctionUpsert>) => void;
}) {
  const eventOptions = [
    { value: '', label: 'בחר אירוע' },
    ...EVENT_TYPE_OPTIONS.map((item) => ({ value: item.value, label: `${item.label} (${item.value})` })),
  ];
  if (value.event_type && !EVENT_TYPE_OPTIONS.some((item) => item.value === value.event_type)) {
    eventOptions.push({ value: value.event_type, label: value.event_type });
  }
  return (
    <Select
      label="איזה אירוע"
      value={value.event_type || ''}
      onChange={(e) => onChange({ event_type: e.target.value || null })}
      options={eventOptions}
      hint="רשימה סגורה מהיומן. ההרצה אחרי האירוע עדיין לא מחוברת."
    />
  );
}

function ParamsEditor({
  params,
  lockedNames,
  onChange,
}: {
  params: AgentFunctionParam[];
  lockedNames: string[];
  onChange: (params: AgentFunctionParam[]) => void;
}) {
  const locked = new Set(lockedNames);
  const add = () => onChange([...params, { name: '', type: 'string', required: true, description: '', source: 'ask' }]);
  const update = (index: number, patch: Partial<AgentFunctionParam>) => {
    onChange(params.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-3 rounded-lg border border-purple-500/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">פרמטרים</p>
        <p className="text-xs text-slate-500 mt-1">
          נוצרים מ-{'{{name}}'} בכתובת או ב-JSON. כאן משנים מקור ותיאור. להסיר מהתבנית — מחק את {'{{name}}'} משם.
        </p>
      </div>
      {params.length === 0 && (
        <p className="text-xs text-slate-500">אין פרמטרים עדיין.</p>
      )}
      {params.map((param, index) => (
        <div key={index} className="rounded-lg bg-white/[0.03] border border-purple-500/10 p-3 space-y-3 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="שם באנגלית"
              placeholder="phone"
              value={param.name}
              onChange={(e) => update(index, { name: e.target.value })}
              dir="ltr"
              className={LTR}
              disabled={locked.has(param.name)}
              hint={locked.has(param.name)
                ? 'השם מגיע מ-{{ }} בכתובת או ב-JSON.'
                : 'זה השם ב-JSON וב-{{phone}}. אותיות באנגלית בלבד.'}
            />
            <Select
              label="מאיפה הערך"
              value={param.source}
              onChange={(e) => update(index, { source: e.target.value as ParamSource })}
              options={SOURCES.map((s) => ({ value: s.id, label: s.label }))}
              hint="לשאול = מהשיחה. טלפון/שם = מהכרטיס. שמור = מפונקציה קודמת. סיכום = סיכום השיחה."
            />
          </div>
          {param.source === 'saved' && (
            <Input
              label="שם הערך השמור"
              placeholder="crm_id"
              value={param.source_key || ''}
              onChange={(e) => update(index, { source_key: e.target.value })}
              dir="ltr"
              className={LTR}
              hint="השם ששמרת ב«לשמור בשם». אפשר function_name.crm_id אם זה מפונקציה אחרת."
            />
          )}
          <Input
            label="תיאור לבוט"
            placeholder="מספר הטלפון של הלקוח"
            value={param.description}
            onChange={(e) => update(index, { description: e.target.value })}
            hint="הבוט רואה את זה כשהוא צריך למלא את הפרמטר. בעברית, משפט קצר."
          />
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-slate-300 flex items-center gap-2">
              <input
                type="checkbox"
                checked={param.required}
                onChange={(e) => update(index, { required: e.target.checked })}
              />
              חובה — בלי הערך הזה הקריאה לא תצא
            </label>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={locked.has(param.name)}
              title={locked.has(param.name) ? 'מחק את המשתנה מהכתובת או מה-JSON קודם' : undefined}
              onClick={() => onChange(params.filter((_, i) => i !== index))}
            >
              הסר
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={add}>
        + הוסף פרמטר
      </Button>
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
  const nextKey = () => {
    let n = 1;
    while (`X-Header-${n}` in headers) n += 1;
    return `X-Header-${n}`;
  };
  const setRow = (index: number, key: string, value: string) => {
    const next: Record<string, string> = {};
    rows.forEach(([existingKey, existingValue], i) => {
      if (i === index) {
        if (key && key !== 'Authorization') next[key] = value;
        return;
      }
      next[existingKey] = existingValue;
    });
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-purple-500/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">Headers נוספים</p>
        <p className="text-xs text-slate-500 mt-1">
          מלבד הטוקן. לרוב לא צריך. שם באנגלית כמו ב-HTTP.
        </p>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-slate-500">אין headers נוספים.</p>
      )}
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="space-y-2 rounded-lg bg-white/[0.03] border border-purple-500/10 p-3">
          <Input
            label="שם ה-header"
            placeholder="X-Api-Key"
            value={key}
            onChange={(e) => setRow(index, e.target.value, value)}
            dir="ltr"
            className={LTR}
            hint="לא Authorization — לזה יש שדה טוקן למעלה."
          />
          <Input
            label="ערך"
            value={value}
            onChange={(e) => setRow(index, key, e.target.value)}
            dir="ltr"
            className={LTR}
            hint="אפשר {{param}} אם זה מגיע מפרמטר."
          />
          <div className="flex justify-start">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                const next = { ...headers };
                delete next[key];
                onChange(next);
              }}
            >
              הסר
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ ...headers, [nextKey()]: '' })}>
        + הוסף header
      </Button>
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
  const add = () => onChange([...outputs, { json_path: '', save_as: '', scope: 'user' }]);
  const update = (index: number, patch: Partial<AgentFunctionOutput>) => {
    onChange(outputs.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-3 rounded-lg border border-purple-500/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">שמירת תשובה מה-API</p>
        <p className="text-xs text-slate-500 mt-1">
          אם ה-API מחזיר למשל {`{ "id": "123" }`} אפשר לשמור את id בשם crm_id, ואז פונקציה אחרת תשתמש בו דרך &quot;ערך שנשמר מפונקציה&quot;. לא חובה.
        </p>
      </div>
      {outputs.length === 0 && (
        <p className="text-xs text-slate-500">לא שומרים כלום מהתשובה.</p>
      )}
      {outputs.map((item, index) => (
        <div key={index} className="space-y-3 rounded-lg bg-white/[0.03] border border-purple-500/10 p-3">
          <Input
            label="שדה ב-JSON של התשובה"
            placeholder="id או data.crm_id"
            value={item.json_path}
            onChange={(e) => update(index, { json_path: e.target.value })}
            dir="ltr"
            className={LTR}
            hint="הנתיב לתשובה. id לשדה בראש, data.id אם זה בתוך אובייקט. בלי $."
          />
          <Input
            label="לשמור בשם"
            placeholder="crm_id"
            value={item.save_as}
            onChange={(e) => update(index, { save_as: e.target.value })}
            dir="ltr"
            className={LTR}
            hint="השם שתשתמש בו אחר כך בפרמטר «ערך שנשמר». אותיות באנגלית."
          />
          <Select
            label="לשמור אצל"
            value={item.scope}
            onChange={(e) => update(index, { scope: e.target.value as 'user' | 'conversation' })}
            options={[
              { value: 'user', label: 'הלקוח — זמין בכל השיחות איתו' },
              { value: 'conversation', label: 'השיחה הזו בלבד' },
            ]}
            hint="לקוח = נשאר בכל השיחות איתו. שיחה = נמחק כשמתחיל צ'אט חדש."
          />
          <Button variant="ghost" size="sm" type="button" onClick={() => onChange(outputs.filter((_, i) => i !== index))}>
            הסר
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={add}>
        + הוסף שמירה
      </Button>
    </div>
  );
}
