'use client';

import { ReactNode } from 'react';

interface Column<T> {
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
}

export function DataTable<T extends { id: number }>({ 
  data, columns, selected, onToggleSelect 
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-3">📭</div>
        <div className="text-slate-400">אין נתונים להצגה</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-700/50 border-b border-slate-600">
            <th className="p-4 text-right w-12">
              <div className="w-5 h-5" /> {/* Placeholder for alignment */}
            </th>
            {columns.map(col => (
              <th 
                key={col.key} 
                className={`p-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {data.map((item, index) => (
            <tr 
              key={item.id} 
              className={`
                transition-colors duration-150
                ${selected.has(item.id) 
                  ? 'bg-blue-500/10' 
                  : 'hover:bg-slate-700/30'
                }
              `}
              style={{ animationDelay: `${index * 20}ms` }}
            >
              <td className="p-4">
                <label className="relative flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    className="sr-only peer"
                  />
                  <div className={`
                    w-5 h-5 rounded border-2 
                    flex items-center justify-center
                    transition-all duration-200
                    ${selected.has(item.id) 
                      ? 'bg-blue-500 border-blue-500' 
                      : 'border-slate-600 hover:border-slate-500'
                    }
                  `}>
                    {selected.has(item.id) && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </label>
              </td>
              {columns.map(col => (
                <td key={col.key} className={`p-4 ${col.className || ''}`}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
