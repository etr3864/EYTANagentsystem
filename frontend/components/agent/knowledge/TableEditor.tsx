'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { getDataTable, updateDataTable } from '@/lib/api';
import { applyPaste, emptyRow, parseTsv, renameColumn, rowsFromApi } from './grid';

interface TableEditorProps {
  agentId: number;
  tableId: number;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TableEditor({
  agentId, tableId, canEdit, onClose, onSaved,
}: TableEditorProps) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const table = await getDataTable(agentId, tableId);
        if (cancelled) return;
        const cols = Object.keys(table.columns);
        setName(table.name);
        setColumns(cols);
        setRows(rowsFromApi(table.rows, cols));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, tableId]);

  const setCell = (row: number, col: string, value: string) => {
    setRows((prev) => prev.map((item, i) => (i === row ? { ...item, [col]: value } : item)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow(columns)]);

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addColumn = () => {
    const next = `עמודה ${columns.length + 1}`;
    setColumns((prev) => [...prev, next]);
    setRows((prev) => prev.map((row) => ({ ...row, [next]: '' })));
  };

  const removeColumn = (index: number) => {
    if (columns.length <= 1) return;
    const removed = columns[index];
    setColumns((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) => prev.map((row) => {
      const copy = { ...row };
      delete copy[removed];
      return copy;
    }));
  };

  const onHeaderChange = (index: number, value: string) => {
    const result = renameColumn(columns, rows, index, value);
    setColumns(result.columns);
    setRows(result.rows);
  };

  const onPaste = (row: number, col: number, text: string) => {
    const grid = parseTsv(text);
    if (grid.length === 0) return;
    setRows(applyPaste(rows, columns, row, col, grid));
  };

  const save = async () => {
    const nextName = name.trim();
    if (!nextName) {
      setError('חובה לתת שם לטבלה');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateDataTable(agentId, tableId, { name: nextName, columns, rows });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-white">עריכת טבלה</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>חזרה</Button>
        </div>

        {loading && <p className="text-sm text-slate-400">טוען…</p>}

        {!loading && (
          <>
            <Input
              label="שם הטבלה"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
            />

            <div className="overflow-auto max-h-[60vh] border border-slate-700 rounded-lg">
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr>
                    <th className="w-10 px-2 py-2 text-slate-500 font-normal">#</th>
                    {columns.map((col, i) => (
                      <th key={`${col}-${i}`} className="border border-slate-700 p-1 min-w-[140px]">
                        <input
                          defaultValue={col}
                          disabled={!canEdit}
                          onBlur={(e) => onHeaderChange(i, e.target.value)}
                          className="w-full bg-transparent text-white px-2 py-1 font-medium"
                        />
                        {canEdit && columns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(i)}
                            className="text-[11px] text-slate-500 hover:text-red-400 px-2 pb-1"
                          >
                            מחק עמודה
                          </button>
                        )}
                      </th>
                    ))}
                    {canEdit && (
                      <th className="w-10 p-1">
                        <button type="button" onClick={addColumn} className="text-slate-400 hover:text-white px-2">+</button>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} className="text-center text-slate-500 py-6">
                        אין שורות. הוסף שורה או הדבק מ-Excel.
                      </td>
                    </tr>
                  )}
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-slate-800/20">
                      <td className="px-2 text-slate-500 text-center">{rowIndex + 1}</td>
                      {columns.map((col, colIndex) => (
                        <td key={col} className="border border-slate-800 p-0">
                          <input
                            value={row[col] ?? ''}
                            disabled={!canEdit}
                            onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                            onChange={(e) => setCell(rowIndex, col, e.target.value)}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              if (!text.includes('\t') && !text.includes('\n')) return;
                              e.preventDefault();
                              onPaste(rowIndex, colIndex, text);
                            }}
                            className={`w-full bg-transparent text-white px-2 py-1.5 ${
                              active?.row === rowIndex && active?.col === colIndex
                                ? 'outline outline-1 outline-purple-500'
                                : ''
                            }`}
                          />
                        </td>
                      ))}
                      {canEdit && (
                        <td className="p-1">
                          <button
                            type="button"
                            onClick={() => removeRow(rowIndex)}
                            className="text-slate-500 hover:text-red-400 px-1"
                          >
                            ×
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={addRow}>+ שורה</Button>
                <Button variant="secondary" size="sm" onClick={addColumn}>+ עמודה</Button>
                <span className="text-xs text-slate-500">אפשר להדביק ישירות מ-Excel</span>
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {canEdit && (
              <div className="flex justify-end items-center gap-3">
                {saved && <span className="text-sm text-emerald-400">נשמר</span>}
                <Button onClick={save} loading={saving}>שמור</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}