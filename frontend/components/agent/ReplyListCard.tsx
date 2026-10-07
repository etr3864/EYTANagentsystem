'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardHeader, ListPager } from '@/components/ui';
import {
  addReplyPerson,
  editReplyPerson,
  getReplyList,
  removeReplyPeople,
  setReplyListEnabled,
  type ReplyPerson,
} from '@/lib/api/replyList';

export function ReplyListCard({ agentId }: { agentId: number }) {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<ReplyPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextPage: number) => {
    let data = await getReplyList(agentId, nextPage);
    if (data.items.length === 0 && data.total > 0 && data.page > 1) {
      data = await getReplyList(agentId, Math.max(1, Math.ceil(data.total / data.page_size)));
    }
    setItems(data.items);
    setTotal(data.total);
    setPage(data.page);
    setPageSize(data.page_size);
    setEnabled(data.enabled);
  }, [agentId]);

  useEffect(() => {
    setPicked(new Set());
    load(1).catch(() => setError('לא הצלחנו לטעון את הרשימה'));
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  const pageAll = items.length > 0 && items.every((row) => picked.has(row.phone));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(phoneKey: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(phoneKey)) next.delete(phoneKey);
      else next.add(phoneKey);
      return next;
    });
  }

  function togglePage() {
    setPicked((current) => {
      const next = new Set(current);
      const every = items.every((row) => next.has(row.phone));
      items.forEach((row) => (every ? next.delete(row.phone) : next.add(row.phone)));
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>רק אנשים מהרשימה</CardHeader>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          כבוי — הבוט עונה לכולם, גם אם הרשימה מלאה. דולק — הוא עונה רק למי שברשימה, עם ההנחיה של האדם הזה. השאר נשמרים בלי מענה.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy || total === 0}
            onChange={(event) => run(async () => {
              setEnabled(await setReplyListEnabled(agentId, event.target.checked));
            })}
          />
          הפעל
          {total === 0 && <span className="text-xs text-[var(--text-muted)]">אחרי אדם אחד לפחות</span>}
        </label>

        <div className="grid gap-2 md:grid-cols-[10rem_10rem_1fr_auto]">
          <input className={field} dir="ltr" placeholder="מספר" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className={field} placeholder="שם" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className={field} placeholder="הנחיה, עד 2000 תווים" maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => run(async () => {
              await addReplyPerson(agentId, phone, name, note);
              setPhone('');
              setName('');
              setNote('');
            })}
          >
            הוסף
          </Button>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="overflow-hidden rounded-lg border border-[var(--edge)]">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)]">אין אנשים ברשימה.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] px-3 py-2">
                <input type="checkbox" checked={pageAll} disabled={busy} onChange={togglePage} />
                <span className="text-xs text-[var(--text-muted)]">
                  {total > items.length ? 'בחר הכל בעמוד' : 'בחר הכל'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={busy || picked.size === 0}
                  onClick={() => run(async () => {
                    setEnabled(await removeReplyPeople(agentId, [...picked]));
                    setPicked(new Set());
                  })}
                >
                  מחק נבחרים{picked.size ? ` (${picked.size})` : ''}
                </Button>
                <button
                  type="button"
                  className="text-xs text-rose-400"
                  disabled={busy || total === 0}
                  onClick={() => {
                    if (!window.confirm('למחוק את כל האנשים? המתג ייכבה.')) return;
                    run(async () => {
                      setEnabled(await removeReplyPeople(agentId, [], true));
                      setPicked(new Set());
                    });
                  }}
                >
                  מחק את כולם
                </button>
              </div>
              {items.map((row) => (
                <PersonRow
                  key={`${row.phone}:${row.name}:${row.note}`}
                  row={row}
                  checked={picked.has(row.phone)}
                  disabled={busy}
                  onToggle={() => toggle(row.phone)}
                  onSave={(next) => run(async () => {
                    await editReplyPerson(agentId, row.phone, next.name, next.note, next.phone);
                    setPicked((current) => {
                      if (!current.has(row.phone)) return current;
                      const copy = new Set(current);
                      copy.delete(row.phone);
                      return copy;
                    });
                  })}
                  onDelete={() => run(async () => {
                    setEnabled(await removeReplyPeople(agentId, [row.phone]));
                    setPicked((current) => {
                      if (!current.has(row.phone)) return current;
                      const copy = new Set(current);
                      copy.delete(row.phone);
                      return copy;
                    });
                  })}
                />
              ))}
            </>
          )}
        </div>
        <ListPager
          page={page}
          totalPages={totalPages}
          from={from}
          to={to}
          total={total}
          onPage={(next) => {
            setPage(next);
            load(next).catch(() => setError('לא הצלחנו לטעון את הרשימה'));
          }}
        />
      </div>
    </Card>
  );
}

const field = 'w-full rounded-lg border border-[var(--edge)] bg-transparent px-3 py-2 text-sm';

function PersonRow({
  row, checked, disabled, onToggle, onSave, onDelete,
}: {
  row: ReplyPerson;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSave: (next: ReplyPerson) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(row.phone);
  const [name, setName] = useState(row.name);
  const [note, setNote] = useState(row.note);

  if (!editing) {
    return (
      <div className="flex items-start gap-2 border-b border-[var(--edge)] px-3 py-2 last:border-b-0">
        <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={onToggle} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--ink)]">{row.name}</p>
          <p className="text-xs text-[var(--text-muted)]" dir="ltr">{row.phone}</p>
          {row.note && <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{row.note}</p>}
        </div>
        <button type="button" className="text-xs text-[var(--acc)]" disabled={disabled} onClick={() => setEditing(true)}>ערוך</button>
        <button type="button" className="text-xs text-rose-400" disabled={disabled} onClick={onDelete}>מחק</button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-[var(--edge)] px-3 py-2 last:border-b-0">
      <div className="grid gap-2 md:grid-cols-2">
        <input className={field} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={field} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <textarea className={field} maxLength={2000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={() => onSave({ phone, name, note })}>שמור</Button>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => setEditing(false)}>ביטול</Button>
      </div>
    </div>
  );
}
