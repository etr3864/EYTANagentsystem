'use client';

import { useEffect, useState } from 'react';
import { Button, ListPager } from '@/components/ui';
import {
  addBlocked,
  deleteBlocked,
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
  const [items, setItems] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(nextPage = page) {
    const data = await getBlocklist(agentId, nextPage);
    setItems(data.items);
    setTotal(data.total);
    setPage(data.page);
    setPageSize(data.page_size);
    onCount(data.total);
  }

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
              disabled={busy || !draft.trim()}
              onClick={() => run(async () => {
                const raw = draft.trim();
                if (/[\s,;]/.test(raw)) await importBlocklist(agentId, 'append', null, raw);
                else await addBlocked(agentId, raw);
                setDraft('');
              })}
            >
              הוסף
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".txt,.csv,.xlsx,text/plain,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || !file}
              onClick={() => run(async () => {
                if (!file) return;
                await importBlocklist(agentId, 'append', file, '');
                setFile(null);
              })}
            >
              הוסף מהקובץ
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={busy || !file}
              onClick={() => run(async () => {
                if (!file) return;
                await importBlocklist(agentId, 'replace', file, '');
                setFile(null);
                setPage(1);
              })}
            >
              החלף את הרשימה
            </Button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="overflow-hidden rounded-lg border border-[var(--edge)]">
            {items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--text-muted)]">אין מספרים. הבוט עונה לכולם.</p>
            ) : items.map((phone) => (
              <NumberRow
                key={phone}
                phone={phone}
                disabled={busy}
                onSave={(next) => run(() => editBlocked(agentId, phone, next))}
                onDelete={() => run(() => deleteBlocked(agentId, phone))}
              />
            ))}
          </div>
          <ListPager page={page} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function NumberRow({
  phone,
  disabled,
  onSave,
  onDelete,
}: {
  phone: string;
  disabled: boolean;
  onSave: (phone: string) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(phone);
  return (
    <div className="flex items-center gap-2 border-b border-[var(--edge)] px-3 py-2 last:border-b-0">
      <input
        className="min-w-0 flex-1 bg-transparent text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() && value.trim() !== phone) onSave(value.trim());
        }}
      />
      <button type="button" className="text-xs text-rose-400" disabled={disabled} onClick={onDelete}>
        מחק
      </button>
    </div>
  );
}
