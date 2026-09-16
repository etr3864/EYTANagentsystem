'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardHeader, ListPager } from '@/components/ui';
import {
  API_URL,
  createAgentTrigger,
  deleteAgentTrigger,
  listAgentTriggers,
  patchAgentTrigger,
  type AgentTrigger,
  type TriggerKind,
} from '@/lib/api';
import { usePagedList } from '@/lib/usePagedList';

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
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const paged = usePagedList(items);

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
      await patchAgentTrigger(agentId, item.id, { enabled: !item.enabled });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לעדכן');
    }
  };

  const rename = async (item: AgentTrigger) => {
    const next = (draftNames[item.id] ?? item.name).trim();
    if (!next || next === item.name) {
      setDraftNames((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      return;
    }
    try {
      await patchAgentTrigger(agentId, item.id, { name: next });
      setDraftNames((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לשנות שם');
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
        <h2 className="text-lg font-medium text-[var(--ink)]">טריגרים פנימיים</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
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
      {loading && <p className="text-[var(--text-secondary)] text-sm">טוען…</p>}
      {!loading && items.length === 0 && (
        <p className="text-[var(--text-secondary)] text-sm">עוד לא הוקם טריגר — אין כתובת לחבר.</p>
      )}

      <div className="space-y-2">
        {paged.items.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 text-right">
                <input
                  value={draftNames[item.id] ?? item.name}
                  onChange={(e) => setDraftNames((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  onBlur={() => rename(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="w-full bg-transparent text-[var(--ink)] font-medium text-base border-b border-transparent hover:border-[var(--acc)] focus:border-[var(--acc)] focus:outline-none py-0.5"
                />
                <button
                  type="button"
                  className="text-xs text-[var(--text-secondary)] mt-0.5"
                  onClick={() => setOpenId(openId === item.id ? null : item.id)}
                >
                  {KIND_META[item.kind].title} · {openId === item.id ? 'הסתר חיבור' : 'הצג חיבור'}
                </button>
              </div>
              <EnableSwitch enabled={item.enabled} onToggle={() => toggle(item)} />
              <Button variant="secondary" size="sm" onClick={() => remove(item)}>מחק</Button>
            </div>
            {openId === item.id && (
              <TriggerDocs item={item} copied={copied} onCopy={copy} />
            )}
          </Card>
        ))}
        <ListPager
          page={paged.page}
          totalPages={paged.totalPages}
          from={paged.from}
          to={paged.to}
          total={paged.total}
          onPage={paged.setPage}
        />
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
          ? 'border-[var(--edge)] bg-[var(--glass)] opacity-50 cursor-not-allowed'
          : 'border-[var(--edge)] bg-[var(--glass)] hover:border-[var(--acc)]'
      }`}
    >
      <div className="text-[var(--ink)] font-medium">{busy ? 'יוצר…' : `+ ${meta.title}`}</div>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{disabled ? blockedReason : meta.hint}</p>
    </button>
  );
}

function EnableSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-sm text-[var(--text-secondary)]">{enabled ? 'פעיל' : 'כבוי'}</span>
      <button
        type="button"
        dir="ltr"
        onClick={onToggle}
        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-[var(--bg-tertiary)]'}`}
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
    <div className="mt-4 space-y-4 border-t border-[var(--edge)]/60 pt-4">
      {!item.enabled && (
        <p className="text-xs text-amber-400">הטריגר כבוי. מדליקים למעלה כדי שהאוטומציה תעבוד.</p>
      )}

      <div className="text-sm text-[var(--text-secondary)] space-y-2 bg-[var(--glass-2)] rounded-lg px-3 py-3">
        <p className="font-medium text-[var(--ink)]">איך מחברים מכל מערכת</p>
        <ol className="list-decimal pr-5 space-y-1 text-[var(--text-secondary)] text-xs">
          <li>יוצרים בקשת HTTP. שיטה: <strong className="text-[var(--ink)]">POST</strong></li>
          <li>מדביקים את הכתובת בשדה URL</li>
          <li>בכותרות: שם <code className="text-green-400">X-API-Key</code> וערך = המפתח. ועוד אחת: <code className="text-[var(--ink)]">Content-Type</code> = <code className="text-[var(--ink)]">application/json</code></li>
          <li>בגוף הבקשה מדביקים את הדוגמה, מחליפים טלפון וערכים, שולחים</li>
        </ol>
      </div>

      <CopyRow label="כתובת ל-URL" value={endpoint} tone="blue" copied={copied === `url-${id}`} onCopy={() => onCopy(endpoint, `url-${id}`)} />
      <CopyRow label="המפתח (הערך של X-API-Key)" value={item.token} tone="green" copied={copied === `key-${id}`} onCopy={() => onCopy(item.token, `key-${id}`)} />
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[var(--text-secondary)]">דוגמה ל-Body — להדביק ולהחליף ערכים</label>
          <Button variant="secondary" size="sm" onClick={() => onCopy(body, `body-${id}`)}>
            {copied === `body-${id}` ? '✓' : 'העתק'}
          </Button>
        </div>
        <pre className="bg-[var(--glass-2)] text-[var(--text-secondary)] text-xs px-3 py-2 rounded font-mono overflow-x-auto whitespace-pre-wrap">{body}</pre>
      </div>

      {item.kind === 'push' ? (
        <div className="text-xs text-[var(--text-secondary)] space-y-2">
          <p><strong className="text-[var(--ink)]">phone</strong> — מספר הלקוח. רק ספרות, בלי + וליווים. לדוגמה 972501234567</p>
          <p><strong className="text-[var(--ink)]">persist</strong> — האם לזכור לתמיד או רק עכשיו:</p>
          <p className="pr-3">true — הסוכן יזכור גם מחר, בכל שיחה. מתאים לחבילה, מנוי, שם ב-CRM</p>
          <p className="pr-3">false — רק בשיחה הפתוחה. מתאים ל״עכשיו בתשלום״ / ״נקבע תור להיום״</p>
          <p><strong className="text-[var(--ink)]">data</strong> — השדות עצמם. כותבים איזה מפתח שרוצים: plan, city, status…</p>
          <p><strong className="text-[var(--ink)]">message</strong> — לא חובה. אם ממלאים, הלקוח מקבל את הטקסט בוואטסאפ (רק חיבור לא רשמי)</p>
        </div>
      ) : (
        <div className="text-xs text-[var(--text-secondary)] space-y-2">
          <p><strong className="text-[var(--ink)]">phone</strong> — מספר הלקוח. רק ספרות, בלי +</p>
          <p><strong className="text-[var(--ink)]">message</strong> — מה שהלקוח יראה. עובד רק בוואטסאפ הלא רשמי</p>
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
  const color = tone === 'green' ? 'text-green-400' : 'text-[var(--acc)]';
  return (
    <div>
      <label className="block text-xs text-[var(--text-secondary)] mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <code className={`flex-1 bg-[var(--glass-2)] ${color} text-xs px-3 py-2 rounded font-mono break-all`}>{value}</code>
        <Button variant="secondary" size="sm" onClick={onCopy}>{copied ? '✓' : 'העתק'}</Button>
      </div>
    </div>
  );
}
