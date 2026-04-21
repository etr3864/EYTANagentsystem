'use client';

import { ReactNode, useState, useCallback } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T extends { id: number }> {
  data: T[];
  columns: Column<T>[];
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onDeselectAll: () => void;
  page: number;
  total: number;
  perPage: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  expandRow?: (item: T) => ReactNode;
}

export function DataTable<T extends { id: number }>({
  data, columns, selected, onToggleSelect,
  onSelectAll, onDeselectAll,
  page, total, perPage, hasMore, onPageChange,
  expandRow,
}: DataTableProps<T>) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const allSelected = data.length > 0 && data.every(d => selected.has(d.id));

  const handleHeaderCheck = useCallback(() => {
    if (allSelected) onDeselectAll();
    else onSelectAll(data.map(d => d.id));
  }, [allSelected, data, onSelectAll, onDeselectAll]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  if (data.length === 0 && page === 1) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-3">📭</div>
        <div className="text-slate-400">אין נתונים להצגה</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Scrollable table with fixed header */}
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800 border-b border-slate-600">
              <th className="p-3 text-right w-12">
                <label className="flex items-center justify-center cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={handleHeaderCheck} className="sr-only peer" />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    allSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-600 hover:border-slate-500'
                  }`}>
                    {allSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </label>
              </th>
              {expandRow && <th className="p-3 w-8" />}
              {columns.map(col => (
                <th key={col.key} className={`p-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {data.map(item => (
              <>
                <tr
                  key={item.id}
                  className={`transition-colors duration-100 ${
                    selected.has(item.id) ? 'bg-blue-500/10' : 'hover:bg-slate-700/30'
                  }`}
                >
                  <td className="p-3">
                    <label className="flex items-center justify-center cursor-pointer">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggleSelect(item.id)} className="sr-only" />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        selected.has(item.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-600 hover:border-slate-500'
                      }`}>
                        {selected.has(item.id) && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </label>
                  </td>
                  {expandRow && (
                    <td className="p-3">
                      <button onClick={() => toggleExpand(item.id)} className="text-slate-400 hover:text-white transition-colors">
                        <svg className={`w-4 h-4 transition-transform ${expandedId === item.id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={`p-3 ${col.className || ''}`}>
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
                {expandRow && expandedId === item.id && (
                  <tr key={`${item.id}-expanded`} className="bg-slate-800/50">
                    <td colSpan={columns.length + 2} className="p-4">
                      {expandRow(item)}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-800/50">
        <div className="text-sm text-slate-400" dir="rtl">
          {total > 0 ? `${start}-${end} מתוך ${total.toLocaleString()}` : 'אין נתונים'}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
          >
            הקודם
          </button>
          <span className="text-sm text-slate-400 min-w-[4rem] text-center">
            {page} / {totalPages}
          </span>
          <button
            disabled={!hasMore}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
          >
            הבא
          </button>
        </div>
      </div>
    </div>
  );
}
