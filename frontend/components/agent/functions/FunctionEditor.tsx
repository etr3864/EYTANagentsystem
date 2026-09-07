'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/Input';
import type { AgentFunctionParam, AgentFunctionOutput, FunctionUpsert, ParamSource } from '@/lib/agentFunctionTypes';
import { EVENT_TYPE_OPTIONS } from '@/lib/agentFunctionTypes';
import { prettyJsonPreservingVars } from '@/lib/agentFunctions';

const LTR = 'text-left font-mono text-sm';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SOURCES: { id: ParamSource; label: string }[] = [
  { id: 'ask', label: 'לשאול את הלקוח' },
  { id: 'user.phone', label: 'טלפון הלקוח' },
  { id: 'user.name', label: 'שם הלקוח' },
  { id: 'saved', label: 'ערך שנשמר מפונקציה' },
  { id: 'event', label: 'מהאירוע' },
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
  const [jsonError, setJsonError] = useState<string | null>(null);
  const set = (patch: Partial<FunctionUpsert>) => onChange({ ...value, ...patch });

  const formatBody = () => {
    if (!value.body_template) return;
    try {
      set({ body_template: prettyJsonPreservingVars(value.body_template) });
      setJsonError(null);
    } catch {
      setJsonError('JSON לא תקין — תקן ואז לחץ שוב');
    }
  };

  const eventOptions = [
    { value: '', label: 'בחר אירוע' },
    ...EVENT_TYPE_OPTIONS.map((item) => ({ value: item.value, label: `${item.label} (${item.value})` })),
  ];
  if (value.event_type && !EVENT_TYPE_OPTIONS.some((item) => item.value === value.event_type)) {
    eventOptions.push({ value: value.event_type, label: value.event_type });
  }

  return (
    <div className="space-y-5 min-w-0">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <p className="text-sm text-slate-400">
        הבוט קורא ל-HTTP חיצוני בשיחה. שמור, בדוק (יבש ואז אמיתי), ורק אז הפעל.
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
          onChange={(e) => set({ method: e.target.value })}
          options={METHODS.map((m) => ({ value: m, label: m }))}
          dir="ltr"
          hint="GET לשליפה. POST/PUT/PATCH ליצירה או עדכון — אז מופיע גוף JSON."
        />
        <Select
          label="סוג פעולה"
          value={value.side_effect}
          onChange={(e) => set({ side_effect: e.target.value as 'read' | 'write' })}
          options={[
            { value: 'read', label: 'קריאה — לא משנה כלום אצל הלקוח' },
            { value: 'write', label: 'כתיבה — יוצר/מעדכן משהו' },
          ]}
          hint="כתיבה נחסמת אם לא ברור שהצלחנו. קריאה בטוחה יותר לבדיקות."
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
      </div>

      {value.trigger === 'event' && (
        <Select
          label="איזה אירוע"
          value={value.event_type || ''}
          onChange={(e) => set({ event_type: e.target.value || null })}
          options={eventOptions}
          hint="רשימה סגורה מהיומן. ההרצה אחרי האירוע עדיין לא מחוברת."
        />
      )}

      <Textarea
        label="מתי להשתמש"
        value={value.when_to_use}
        onChange={(e) => set({ when_to_use: e.target.value })}
        rows={3}
        hint="הנחיה לבוט בשפה טבעית, לא קוד. למשל: כשלקוח רוצה להשאיר פרטים לקראת חזרה."
      />
      <Textarea
        label="מתי לא להשתמש"
        value={value.when_not_to_use}
        onChange={(e) => set({ when_not_to_use: e.target.value })}
        rows={2}
        hint="אופציונלי. למשל: אל תקרא אם כבר יש ליד פתוח, או אם הלקוח רק שואל מחיר."
      />
      <Input
        label="כתובת HTTPS"
        value={value.url}
        onChange={(e) => set({ url: e.target.value })}
        dir="ltr"
        className={LTR}
        placeholder="https://example.com/api/leads"
        hint={'רק https. אפשר {{phone}} בנתיב — יוחלף בפרמטר באותו שם.'}
      />

      <ParamsEditor params={value.params} onChange={(params) => set({ params })} />
      <HeadersEditor headers={value.headers} onChange={(headers) => set({ headers })} />

      {hasBody && (
        <div className="space-y-2 rounded-lg border border-purple-500/10 p-3">
          <div>
            <p className="text-sm font-medium text-white">גוף הבקשה (JSON)</p>
            <p className="text-xs text-slate-500 mt-1">
              JSON שנשלח בגוף. {'{{phone}}'} מוחלף בפרמטר. כפתור «סדר JSON» רק מעצב, לא משנה משמעות.
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

      <OutputsEditor outputs={value.outputs} onChange={(outputs) => set({ outputs })} />
      <Textarea
        label="איך להציג ללקוח"
        value={value.response_instructions}
        onChange={(e) => set({ response_instructions: e.target.value })}
        rows={2}
        hint="הנחיה לבוט בשפה טבעית אחרי הצלחה — לא משפט שייקריא מילה במילה. למשל: תגיד שהפנייה נקלטה בלי לחשוף JSON."
      />
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
    <div className="space-y-3 rounded-lg border border-purple-500/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">פרמטרים</p>
        <p className="text-xs text-slate-500 mt-1">
          ערכים שנכנסים לכתובת או ל-JSON. &quot;לשאול את הלקוח&quot; = הבוט שואל ומעביר. השאר נשלפים לבד.
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
              hint="זה השם ב-JSON וב-{{phone}}. אותיות באנגלית בלבד."
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
            <Button variant="ghost" size="sm" type="button" onClick={() => onChange(params.filter((_, i) => i !== index))}>
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
    if (!('Authorization' in headers)) return 'Authorization';
    let n = 1;
    while (`X-Header-${n}` in headers) n += 1;
    return `X-Header-${n}`;
  };
  const setRow = (index: number, key: string, value: string) => {
    const next: Record<string, string> = {};
    rows.forEach(([existingKey, existingValue], i) => {
      if (i === index) {
        if (key) next[key] = value;
        return;
      }
      next[existingKey] = existingValue;
    });
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-lg border border-purple-500/10 p-3">
      <div>
        <p className="text-sm font-medium text-white">Headers / טוקן</p>
        <p className="text-xs text-slate-500 mt-1">
          נשלח עם כל בקשה. טוקן ב-Authorization: <span dir="ltr" className="font-mono">Bearer …</span>. הערך מוצפן אחרי שמירה.
        </p>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-slate-500">אין headers עדיין.</p>
      )}
      {rows.map(([key, value], index) => (
        <div key={`${key}-${index}`} className="space-y-2 rounded-lg bg-white/[0.03] border border-purple-500/10 p-3">
          <Input
            label="שם ה-header"
            placeholder="Authorization"
            value={key}
            onChange={(e) => setRow(index, e.target.value, value)}
            dir="ltr"
            className={LTR}
            hint="שם ה-header כמו ב-HTTP. לא בעברית."
          />
          <Input
            label="ערך"
            placeholder="Bearer …"
            value={value}
            onChange={(e) => setRow(index, key, e.target.value)}
            dir="ltr"
            className={LTR}
            hint="הטוקן או הערך המלא. אפשר {{param}} אם זה מגיע מפרמטר."
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
