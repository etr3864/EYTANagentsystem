'use client';

import { Button } from '@/components/ui';
import type { FunctionAttention } from '@/lib/agentFunctions';

export function FunctionAttentionList({
  items,
  onDone,
  onRetry,
}: {
  items: FunctionAttention[];
  onDone: (id: number) => void;
  onRetry: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 space-y-2">
      <p className="text-sm text-amber-200">כתיבות שדורשות טיפול — אל תניחו שהצליחו אצל הלקוח.</p>
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-2 text-sm text-slate-200">
          <div>
            <span className="font-medium">{item.function_name}</span>
            <span className="text-slate-400"> · {item.status}{item.stale ? ' (ישן)' : ''}</span>
            {item.error && <span className="text-slate-500"> · {item.error}</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="secondary" onClick={() => onDone(item.id)}>סמן כהצלחה</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onRetry(item.id)}
              disabled={item.status === 'in_flight' && !item.stale}
            >
              אפשר ניסיון
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
