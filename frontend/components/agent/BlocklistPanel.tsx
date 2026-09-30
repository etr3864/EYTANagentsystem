'use client';

import { useEffect, useRef, useState } from 'react';
import type { BlocklistItem } from '@/lib/api/silence';
import { Button, ListPager } from '@/components/ui';
import {
  addBlocked,
  clearOptOut,
  deleteBlocked,
  deleteBlockedMany,
  editBlocked,
  getBlocklist,
  importBlocklist,
} from '@/lib/api/silence';

export function BlocklistPanel({
  agentId,
  count,
  onCount,
}: {
  agentId: number;
  count: number;
  onCount: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<BlocklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileMode = useRef<'append' | 'replace'>('append');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function load(nextPage = page) {
    let data = await getBlocklist(agentId, nextPage);
    if (data.items.length === 0 && data.total > 0 && data.page > 1) {
      const last = Math.max(1, Math.ceil(data.total / data.page_size));
      data = await getBlocklist(agentId, last);
    }
    setItems(data.items);
    setTotal(data.total);
    setPage(data.page);
    setPageSize(data.page_size);
    onCount(data.total);
  }

  useEffect(() => {
    setPicked(new Set());
  }, [agentId]);

  useEffect(() => {
    if (!open) return;
    load(page).catch(() => setError('לא הצלחנו לטעון את הרשימה'));
  }, [open, page, agentId]);

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

  function openFile(mode: 'append' | 'replace') {
    fileMode.current = mode;
    fileRef.current?.click();
  }

  const pageAll = items.length > 0 && items.every((row) => picked.has(row.phone));
  const pageSome = items.some((row) => picked.has(row.phone));

  function togglePhone(phone: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
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

  function dropPicked(phone: string) {
    setPicked((current) => {
      if (!current.has(phone)) return current;
      const next = new Set(current);
      next.delete(phone);
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const shown = open ? total : count;

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="text-sm text-[var(--acc)]"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'הסתר רשימה' : `הצג רשימה${shown ? ` (${shown})` : ''}`}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            אפשר להדביק מספרים בכל צורה, או להעלות txt, csv או xlsx. הרשימה נפתחת רק כאן.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-[12rem] flex-1 rounded-lg border border-[var(--edge)] bg-transparent px-3 py-2 text-sm"
              placeholder="054… או כמה מספרים"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => run(async () => {
                const raw = draft.trim();
                if (!raw) throw new Error('כתוב מספר, או הדבק כמה');
                if (/[\s,;]/.test(raw)) {
                  const imported = await importBlocklist(agentId, 'append', null, raw);
                  if (imported === 0) throw new Error('לא נמצאו מספרים');
                } else {
                  await addBlocked(agentId, raw);
                }
                setDraft('');
              })}
            >
              הוסף
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (!chosen) return;
                const mode = fileMode.current;
                run(async () => {
                  const imported = await importBlocklist(agentId, mode, chosen, '');
                  if (imported === 0) throw new Error('לא נמצאו מספרים בקובץ');
                  if (mode === 'replace') {
                    setPicked(new Set());
                    setPage(1);
                  }
                });
              }}
            />
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => openFile('append')}>
              הוסף מהקובץ
            </Button>
            <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => openFile('replace')}>
              החלף את הרשימה
            </Button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="overflow-hidden rounded-lg border border-[var(--edge)]">
            {items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--text-muted)]">אין מספרים. הבוט עונה לכולם.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge)] px-3 py-2">
                  <PageTick
                    checked={pageAll}
                    partial={pageSome}
                    disabled={busy}
                    onChange={togglePage}
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    {total > items.length ? 'בחר הכל בעמוד' : 'בחר הכל'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={busy || picked.size === 0}
                    onClick={() => run(async () => {
                      await deleteBlockedMany(agentId, [...picked]);
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
                    if (!window.confirm('מנקה את כל החסימות הידניות. הסרות של לקוחות נשארות.')) return;
                      run(async () => {
                        await deleteBlockedMany(agentId, [], true);
                        setPicked(new Set());
                      });
                    }}
                  >
                    מחק את כל הרשימה
                  </button>
                </div>
                {items.map((row) => (
                  <NumberRow
                    key={row.phone}
                    row={row}
                    checked={picked.has(row.phone)}
                    disabled={busy}
                    onToggle={() => togglePhone(row.phone)}
                    onSave={(next) => run(async () => {
                      await editBlocked(agentId, row.phone, next);
                      dropPicked(row.phone);
                    })}
                    onDelete={() => run(async () => {
                      await deleteBlocked(agentId, row.phone);
                      dropPicked(row.phone);
                    })}
                    onClearOptOut={() => run(async () => {
                      await clearOptOut(agentId, row.phone);
                    })}
                  />
                ))}
              </>
            )}
          </div>
          <ListPager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function PageTick({
  checked,
  partial,
  disabled,
  onChange,
}: {
  checked: boolean;
  partial: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial && !checked;
  }, [partial, checked]);
  return (
    <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
  );
}

function NumberRow({
  row,
  checked,
  disabled,
  onToggle,
  onSave,
  onDelete,
  onClearOptOut,
}: {
  row: BlocklistItem;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSave: (phone: string) => void;
  onDelete: () => void;
  onClearOptOut: () => void;
}) {
  const [value, setValue] = useState(row.phone);
  return (
    <div className="flex items-center gap-2 border-b border-[var(--edge)] px-3 py-2 last:border-b-0">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <div className="min-w-0 flex-1">
        <input
          className="w-full bg-transparent text-sm"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            if (value.trim() && value.trim() !== row.phone) onSave(value.trim());
          }}
        />
        <p className="text-[11px] text-[var(--text-muted)]">
          {row.manual ? 'ידני' : ''}{row.manual && row.opted_out ? ' · ' : ''}{row.opted_out ? 'הסרה' : ''}
          {row.quote ? ` · ${row.quote}` : ''}
        </p>
      </div>
      {row.manual && (
        <button type="button" className="text-xs text-rose-400" disabled={disabled} onClick={onDelete}>הסר חסימה</button>
      )}
      {row.opted_out && (
        <button type="button" className="text-xs text-[var(--text-muted)]" disabled={disabled} onClick={onClearOptOut}>בטל הסרה</button>
      )}
    </div>
  );
}
