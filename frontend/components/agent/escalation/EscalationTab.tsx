'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import {
  createEscalation,
  deleteEscalation,
  listEscalations,
  type EscalationReason,
} from '@/lib/escalation';
import { ReasonCard } from './ReasonCard';

const MAX_REASONS = 8;

export function EscalationTab({ agentId }: { agentId: number }) {
  const [items, setItems] = useState<EscalationReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listEscalations(agentId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { reload(); }, [reload]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const row = await createEscalation(agentId, `סיבה ${items.length + 1}`);
      setItems((prev) => [row, ...prev]);
      setOpenId(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירה');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (item: EscalationReason) => {
    if (!confirm(`למחוק את "${item.name}"? הכלי ייעלם מהסוכן.`)) return;
    try {
      await deleteEscalation(agentId, item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      if (openId === item.id) setOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן למחוק');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-white">אסקלציה</h2>
          <p className="text-sm text-slate-400 mt-1">
            כשהסוכן מזהה מקרה — שולחים לצוות ו/או ל-webhook. הלקוח לא רואה שזה קרה.
            טלפון, שם, פגישות ומידע שמור על הלקוח מתמלאים גם אם לא נכתבו בשיחה.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={creating || items.length >= MAX_REASONS}
          onClick={create}
        >
          {creating ? 'יוצר…' : 'סיבה חדשה'}
        </Button>
      </div>

      {loading && <p className="text-slate-400 text-sm">טוען…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-8 text-center">
          <p className="text-slate-300 text-sm">אין סיבות עדיין.</p>
          <p className="text-slate-500 text-xs mt-1">יוצרים אחת, ממלאים שדות ויעד, ואז מדליקים.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <ReasonCard
            key={item.id}
            agentId={agentId}
            item={item}
            defaultOpen={item.id === openId}
            onChanged={(row) => setItems((prev) => prev.map((it) => (it.id === row.id ? row : it)))}
            onDeleted={() => remove(item)}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
