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
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {enabled
              ? 'הבוט עונה רק למי שברשימה. השאר נשמרים בלי מענה.'
              : 'כבוי. הבוט עונה לכולם, גם אם יש אנשים ברשימה.'}
          </p>
          <Switch
            on={enabled}
            disabled={busy || total === 0}
            onToggle={() => run(async () => {
              setEnabled(await setReplyListEnabled(agentId, !enabled));
            })}
          />
        </div>
        {total === 0 && (
          <p className="text-xs text-[var(--text-muted)]">הוסף אדם אחד כדי להדליק.</p>
        )}

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await addReplyPerson(agentId, phone, name, note);
              setPhone('');
              setName('');
              setNote('');
            });
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${line} w-36`} dir="ltr" placeholder="מספר" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className={`${line} w-36`} placeholder="שם" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" size="sm" disabled={busy}>הוסף</Button>
          </div>
          <input
            className={`${line} w-full`}
            placeholder="הנחיה, רשות"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </form>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        {items.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-[var(--edge)]">
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
          </div>
        )}
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

const line = 'h-9 rounded-lg border border-[var(--edge)] bg-transparent px-3 text-sm';

function Switch({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-sm text-[var(--text-secondary)]">{on ? 'פעיל' : 'כבוי'}</span>
      <button
        type="button"
        dir="ltr"
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          on ? 'bg-emerald-500' : 'bg-[var(--bg-tertiary)]'
        } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

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
      <div className="flex flex-wrap gap-2">
        <input className={`${line} w-36`} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={`${line} w-36`} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <textarea className="w-full rounded-lg border border-[var(--edge)] bg-transparent px-3 py-2 text-sm" maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={disabled} onClick={() => onSave({ phone, name, note })}>שמור</Button>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => setEditing(false)}>ביטול</Button>
      </div>
    </div>
  );
}
