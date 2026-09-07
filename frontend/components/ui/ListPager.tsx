'use client';

import { Button } from './Button';

export function ListPager({
  page,
  totalPages,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-sm text-slate-400">
        {from}–{to} מתוך {total}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            הקודם
          </Button>
          <span className="text-sm text-slate-400 min-w-[3.5rem] text-center tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            הבא
          </Button>
        </div>
      )}
    </div>
  );
}
