'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import {
  API_URL,
  createAgentTrigger,
  deleteAgentTrigger,
  listAgentTriggers,
  patchAgentTrigger,
  type AgentTrigger,
  type TriggerKind,
} from '@/lib/api';

interface TriggersTabProps {
  agentId: number;
  canSendMessage: boolean;
}

const KIND_META: Record<TriggerKind, { title: string; hint: string }> = {
  push: {
    title: 'דחיפת מידע',
    hint: 'הסוכן יזכור פרטים על הלקוח (חבילה, סטטוס, תור…). אפשר גם לשלוח לו הודעה באותו רגע.',
  },
  send: {
    title: 'שליחת הודעה',
    hint: 'רק שולחים טקסט ללקוח בוואטסאפ. הסוכן לא מקבל מידע חדש.',
  },
};

function defaultName(kind: TriggerKind, items: AgentTrigger[]): string {
  const base = KIND_META[kind].title;
  const count = items.filter((item) => item.kind === kind).length;
  return count === 0 ? base : `${base} ${count + 1}`;
}

function triggerEndpoint(kind: TriggerKind): string {
  const path = kind === 'push' ? '/api/external/triggers/push' : '/api/external/triggers/send';
  return `${API_URL}${path}`;
}

function triggerBody(kind: TriggerKind): string {
  if (kind === 'push') {
    return `{
  "phone": "972501234567",
  "persist": true,
  "data": {
    "plan": "gold",
    "city": "תל אביב"
  },
  "message": "שלום, העדכון נקלט"
}`;
  }
  return `{
  "phone": "972501234567",
  "message": "שלום, זו הודעה מאוטומציה"
}`;
}

export function TriggersTab({ agentId, canSendMessage }: TriggersTabProps) {
  const [items, setItems] = useState<AgentTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<TriggerKind | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<AgentTrigger[]> => {
    setLoading(true);
    try {
      const rows = await listAgentTriggers(agentId);
      setItems(rows);
      setError(null);
      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      return [];
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { reload(); }, [reload]);

  const create = async (kind: TriggerKind) => {
    if (kind === 'send' && !canSendMessage) return;
    setBusyKind(kind);
    setError(null);
    try {
      const row = await createAgentTrigger(agentId, defaultName(kind, items), kind);
      setOpenId(row.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירה');
    } finally {
      setBusyKind(null);
    }
  };

  const toggle = async (item: AgentTrigger) => {
    try {
      await patchAgentTrigger(agentId, item.id, !item.enabled);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לעדכן');
    }
  };

  const remove = async (item: AgentTrigger) => {
    if (!confirm(`למחוק את "${item.name}"? האוטומציה תיחסם מיד.`)) return;
    await deleteAgentTrigger(agentId, item.id);
    if (openId === item.id) setOpenId(null);
    await reload();
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-white">טריגרים פנימיים</h2>
        <p className="text-sm text-slate-400 mt-1">
          בוחרים סוג, מעתיקים שלושה דברים לאוטומציה. כיביתם או מחקתם — הקריאה נחסמת.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CreateCard
          kind="push"
          disabled={false}
          busy={busyKind === 'push'}
          onCreate={() => create('push')}
        />
        <CreateCard
          kind="send"
          disabled={!canSendMessage}
          busy={busyKind === 'send'}
          onCreate={() => create('send')}
          blockedReason="צריך חיבור וואטסאפ לא רשמי. לסוכן הזה אין."
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-slate-400 text-sm">טוען…</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-400 text-sm">עוד לא הוקם טריגר — אין כתובת לחבר.</p>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="text-right flex-1 min-w-0"
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
              >
                <CardHeader>{item.name}</CardHeader>
                <p className="text-xs text-slate-400">{KIND_META[item.kind].title}</p>
              </button>
              <EnableSwitch enabled={item.enabled} onToggle={() => toggle(item)} />
              <Button variant="secondary" size="sm" onClick={() => remove(item)}>מחק</Button>
            </div>
            {openId === item.id && (
              <TriggerDocs item={item} copied={copied} onCopy={copy} />
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreateCard({
  kind,
  disabled,
  busy,
  onCreate,
  blockedReason,
}: {
  kind: TriggerKind;
  disabled: boolean;
  busy: boolean;
  onCreate: () => void;
  blockedReason?: string;
}) {
  const meta = KIND_META[kind];
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onCreate}
      className={`text-right rounded-xl border p-4 transition-colors ${
        disabled
          ? 'border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed'
          : 'border-slate-700 bg-slate-900/60 hover:border-blue-500/50'
      }`}
    >
      <div className="text-white font-medium">{busy ? 'יוצר…' : `+ ${meta.title}`}</div>
      <p className="text-xs text-slate-400 mt-1">{disabled ? blockedReason : meta.hint}</p>
    </button>
  );
}

function EnableSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-sm text-slate-300">{enabled ? 'פעיל' : 'כבוי'}</span>
      <button
        type="button"
        dir="ltr"
        onClick={onToggle}
        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function TriggerDocs({
  item,
  copied,
  onCopy,
}: {
  item: AgentTrigger;
  copied: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const endpoint = triggerEndpoint(item.kind);
  const body = triggerBody(item.kind);
  const id = String(item.id);

  return (
    <div className="mt-4 space-y-4 border-t border-slate-700/60 pt-4">
      {!item.enabled && (
        <p className="text-xs text-amber-400">הטריגר כבוי. מדליקים למעלה כדי שהאוטומציה תעבוד.</p>
      )}

      <div className="text-sm text-slate-300 space-y-2 bg-slate-800/50 rounded-lg px-3 py-3">
        <p className="font-medium text-white">איך מחברים מכל מערכת</p>
        <ol className="list-decimal pr-5 space-y-1 text-slate-400 text-xs">
          <li>יוצרים בקשת HTTP. שיטה: <strong className="text-slate-200">POST</strong></li>
          <li>מדביקים את הכתובת בשדה URL</li>
          <li>בכותרות: שם <code className="text-green-400">X-API-Key</code> וערך = המפתח. ועוד אחת: <code className="text-slate-200">Content-Type</code> = <code className="text-slate-200">application/json</code></li>
          <li>בגוף הבקשה מדביקים את הדוגמה, מחליפים טלפון וערכים, שולחים</li>
        </ol>
      </div>

      <CopyRow label="כתובת ל-URL" value={endpoint} tone="blue" copied={copied === `url-${id}`} onCopy={() => onCopy(endpoint, `url-${id}`)} />
      <CopyRow label="המפתח (הערך של X-API-Key)" value={item.token} tone="green" copied={copied === `key-${id}`} onCopy={() => onCopy(item.token, `key-${id}`)} />
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-slate-400">דוגמה ל-Body — להדביק ולהחליף ערכים</label>
          <Button variant="secondary" size="sm" onClick={() => onCopy(body, `body-${id}`)}>
            {copied === `body-${id}` ? '✓' : 'העתק'}
          </Button>
        </div>
        <pre className="bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded font-mono overflow-x-auto whitespace-pre-wrap">{body}</pre>
      </div>

      {item.kind === 'push' ? (
        <div className="text-xs text-slate-400 space-y-2">
          <p><strong className="text-slate-200">phone</strong> — מספר הלקוח. רק ספרות, בלי + וליווים. לדוגמה 972501234567</p>
          <p><strong className="text-slate-200">persist</strong> — האם לזכור לתמיד או רק עכשיו:</p>
          <p className="pr-3">true — הסוכן יזכור גם מחר, בכל שיחה. מתאים לחבילה, מנוי, שם ב-CRM</p>
          <p className="pr-3">false — רק בשיחה הפתוחה. מתאים ל״עכשיו בתשלום״ / ״נקבע תור להיום״</p>
          <p><strong className="text-slate-200">data</strong> — השדות עצמם. כותבים איזה מפתח שרוצים: plan, city, status…</p>
          <p><strong className="text-slate-200">message</strong> — לא חובה. אם ממלאים, הלקוח מקבל את הטקסט בוואטסאפ (רק חיבור לא רשמי)</p>
        </div>
      ) : (
        <div className="text-xs text-slate-400 space-y-2">
          <p><strong className="text-slate-200">phone</strong> — מספר הלקוח. רק ספרות, בלי +</p>
          <p><strong className="text-slate-200">message</strong> — מה שהלקוח יראה. עובד רק בוואטסאפ הלא רשמי</p>
        </div>
      )}
    </div>
  );
}

function CopyRow({
  label, value, tone, copied, onCopy,
}: {
  label: string;
  value: string;
  tone: 'green' | 'blue';
  copied: boolean;
  onCopy: () => void;
}) {
  const color = tone === 'green' ? 'text-green-400' : 'text-blue-400';
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <code className={`flex-1 bg-slate-800 ${color} text-xs px-3 py-2 rounded font-mono break-all`}>{value}</code>
        <Button variant="secondary" size="sm" onClick={onCopy}>{copied ? '✓' : 'העתק'}</Button>
      </div>
    </div>
  );
}
