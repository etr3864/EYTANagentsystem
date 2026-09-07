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
      setItems((prev) => [...prev, row]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירה');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (item: EscalationReason) => {
    if (!confirm(`למחוק את "${item.name}"? הכלי ייעלם מהסוכן.`)) return;
    await deleteEscalation(agentId, item.id);
    setItems((prev) => prev.filter((row) => row.id !== item.id));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-white">אסקלציה</h2>
        <p className="text-sm text-slate-400 mt-1">
          כשהסוכן מזהה מקרה — שולחים לצוות ו/או ל-webhook. הלקוח לא רואה שזה קרה.
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          variant="secondary"
          disabled={creating || items.length >= MAX_REASONS}
          onClick={create}
        >
          סיבה חדשה
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-slate-400 text-sm">טוען…</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-400 text-sm">אין סיבות. יוצרים אחת, מגדירים שדות ויעד, ומדליקים.</p>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <ReasonCard
            key={item.id}
            agentId={agentId}
            item={item}
            onChanged={(row) => setItems((prev) => prev.map((it) => (it.id === row.id ? row : it)))}
            onDeleted={() => remove(item)}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}
