'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import { getSilence, refreshContacts, saveSilence, type SilencePolicy } from '@/lib/api/silence';
import { BlocklistPanel } from './BlocklistPanel';

type PhoneMode = 'off' | 'minutes' | 'forever';

function modeOf(minutes: number | null): PhoneMode {
  if (minutes === null || minutes === undefined) return 'off';
  if (minutes === 0) return 'forever';
  return 'minutes';
}

export function SilenceCard({ agentId }: { agentId: number }) {
  const [policy, setPolicy] = useState<SilencePolicy | null>(null);
  const [mode, setMode] = useState<PhoneMode>('off');
  const [minutes, setMinutes] = useState(60);
  const [contactsOn, setContactsOn] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSilence(agentId).then((data) => {
      setPolicy(data);
      setMode(modeOf(data.phone_silence_minutes));
      setMinutes(data.phone_silence_minutes && data.phone_silence_minutes > 0 ? data.phone_silence_minutes : 60);
      setContactsOn(data.skip_saved_contacts);
      setCount(data.blocklist_count);
    }).catch(() => setError('לא הצלחנו לטעון'));
  }, [agentId]);

  function minutesValue(): number | null {
    if (mode === 'off') return null;
    if (mode === 'forever') return 0;
    return Math.min(10080, Math.max(1, minutes));
  }

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = await saveSilence(agentId, {
        phone_silence_minutes: minutesValue(),
        skip_saved_contacts: contactsOn,
      });
      setPolicy(next);
      setCount(next.blocklist_count);
      setSaved(true);
    } catch (err) {
      setSaved(false);
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      if (!policy?.skip_saved_contacts) {
        if (!contactsOn) throw new Error('סמן «דולק» לפני הרענון');
        const savedPolicy = await saveSilence(agentId, {
          phone_silence_minutes: minutesValue(),
          skip_saved_contacts: true,
        });
        setPolicy(savedPolicy);
      }
      const next = await refreshContacts(agentId);
      setPolicy(next);
      setContactsOn(next.skip_saved_contacts);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  const contactsLive = Boolean(policy?.skip_saved_contacts);

  return (
    <Card>
      <CardHeader>מתי הבוט לא עונה</CardHeader>
      <div className="space-y-5">
        <Row
          title="שתיקה אחרי הודעה מהטלפון"
          body="כשבעל העסק כותב מהטלפון או מוואטסאפ ווב, הבוט שותק בשיחה הזו. הודעה מהדשבורד לא משתיקה. כבוי — שום דבר לא משתנה."
        >
          <select
            className="rounded-lg border border-[var(--edge)] bg-transparent px-3 py-2 text-sm"
            value={mode}
            onChange={(event) => setMode(event.target.value as PhoneMode)}
          >
            <option value="off">כבוי</option>
            <option value="minutes">לזמן קצוב</option>
            <option value="forever">עד שמישהו מחזיר</option>
          </select>
          {mode === 'minutes' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="number"
                min={1}
                max={10080}
                className="w-24 rounded-lg border border-[var(--edge)] bg-transparent px-3 py-2"
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value) || 1)}
              />
              דקות
            </label>
          )}
        </Row>

        <Row
          title="לא לענות למי ששמור באנשי הקשר"
          body="רק כשזה דולק הבוט בודק את הפנקס של הטלפון, ולא עונה למי ששמור שם. כבוי — הפנקס לא נקרא בכלל."
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={contactsOn}
              onChange={(event) => setContactsOn(event.target.checked)}
            />
            דולק
          </label>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={refresh}>
            רענון מהסשן
          </Button>
          {contactsLive && !policy?.contacts_synced_at && (
            <span className="text-xs text-[var(--text-muted)]">הפנקס עדיין לא נטען. עד אז הבוט עונה.</span>
          )}
        </Row>

        <Row
          title="רשימת מספרים"
          body="הבוט לא עונה למספרים שברשימה, גם אם שתיקת הטלפון כבויה. רשימה ריקה לא משנה כלום, ולא נפתחת שיחה רק בגלל העלאה."
        >
          <BlocklistPanel agentId={agentId} count={count} onCount={setCount} />
        </Row>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {saved && !error && <p className="text-sm text-emerald-500">נשמר</p>}
        <Button type="button" onClick={save} disabled={busy || !policy} loading={busy}>
          שמור שתיקה
        </Button>
      </div>
    </Card>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-[var(--edge)] pb-4 last:border-b-0">
      <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{body}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
