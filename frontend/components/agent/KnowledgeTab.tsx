'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, TrashIcon } from '@/components/ui';
import type { Document, DataTable } from '@/lib/types';
import {
  bulkDeleteDocuments,
  createBlankTable,
  deleteDataTable,
  deleteDocument,
  getDataTables,
  getDocuments,
  uploadDataTable,
  uploadDocument,
} from '@/lib/api';
import { DocumentEditor } from './knowledge/DocumentEditor';
import { TableEditor } from './knowledge/TableEditor';
import { TitleDialog } from './knowledge/TitleDialog';
import { suggestedTitle } from './knowledge/grid';
import { FILE_TOO_HEAVY, MAX_UPLOAD_BYTES } from './knowledge/limits';

interface KnowledgeTabProps {
  agentId: number;
  canUpload?: boolean;
}

type Section = 'documents' | 'tables';
type PendingFile = { file: File; kind: 'document' | 'table' };

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function KnowledgeTab({ agentId, canUpload = true }: KnowledgeTabProps) {
  const [section, setSection] = useState<Section>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [openDoc, setOpenDoc] = useState<number | 'new' | null>(null);
  const [openTable, setOpenTable] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const docInputRef = useRef<HTMLInputElement>(null);
  const tableInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [docs, nextTables] = await Promise.all([
      getDocuments(agentId),
      getDataTables(agentId),
    ]);
    setDocuments(docs);
    setTables(nextTables);
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const trackUpload = async (run: (onProgress: (p: number) => void) => Promise<unknown>) => {
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('מעלה...');
    try {
      await run((progress) => {
        setUploadProgress(progress);
        if (progress < 50) setUploadStatus('מעלה קובץ...');
        else if (progress < 100) setUploadStatus('מאנדקס לחיפוש...');
        else setUploadStatus('הושלם');
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהעלאה');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
    }
  };

  const confirmTitle = async (title: string) => {
    const current = pending;
    setPending(null);
    if (!current) return;
    if (current.kind === 'document') {
      await trackUpload((onProgress) => uploadDocument(agentId, current.file, title, onProgress));
    } else {
      await trackUpload((onProgress) => uploadDataTable(agentId, current.file, title, undefined, onProgress));
    }
  };

  const pickDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'doc', 'txt'].includes(ext || '')) {
      setError('סוג קובץ לא נתמך. PDF, DOCX או TXT');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(FILE_TOO_HEAVY);
      return;
    }
    setPending({ file, kind: 'document' });
  };

  const pickTable = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('יש להעלות קובץ CSV');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(FILE_TOO_HEAVY);
      return;
    }
    setPending({ file, kind: 'table' });
  };

  const createTable = async (title: string) => {
    setCreatingTable(false);
    try {
      const table = await createBlankTable(agentId, title, ['עמודה 1', 'עמודה 2']);
      await reload();
      setOpenTable(table.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת טבלה');
    }
  };

  const removeDocument = async (id: number) => {
    if (!confirm('למחוק את המסמך?')) return;
    try {
      await deleteDocument(agentId, id);
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setSelected((prev) => prev.filter((item) => item !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן למחוק');
    }
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    if (!confirm(`למחוק ${selected.length} מסמכים?`)) return;
    try {
      await bulkDeleteDocuments(agentId, selected);
      setDocuments((prev) => prev.filter((doc) => !selected.includes(doc.id)));
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן למחוק');
    }
  };

  const toggleSelected = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const removeTable = async (id: number) => {
    if (!confirm('למחוק את הטבלה?')) return;
    try {
      await deleteDataTable(agentId, id);
      setTables((prev) => prev.filter((table) => table.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן למחוק');
    }
  };

  if (openDoc !== null) {
    return (
      <DocumentEditor
        agentId={agentId}
        docId={openDoc === 'new' ? null : openDoc}
        canEdit={canUpload}
        onClose={() => setOpenDoc(null)}
        onSaved={async () => {
          await reload();
          setOpenDoc(null);
        }}
      />
    );
  }

  if (openTable !== null) {
    return (
      <TableEditor
        agentId={agentId}
        tableId={openTable}
        canEdit={canUpload}
        onClose={() => setOpenTable(null)}
        onSaved={async () => {
          await reload();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { id: 'documents' as Section, label: 'מסמכים', count: documents.length },
          { id: 'tables' as Section, label: 'טבלאות', count: tables.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {tab.label}
            <span className="mr-2 text-xs opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {uploading && (
        <Card className="!bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-blue-300 mb-2">{uploadStatus}</div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
            <span className="text-blue-400 font-medium">{uploadProgress}%</span>
          </div>
        </Card>
      )}

      <Card>
        {section === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-medium text-white">מסמכים</h3>
              <div className="flex gap-2 flex-wrap">
                {selected.length > 0 && (
                  <Button variant="danger" size="sm" onClick={removeSelected}>
                    מחק נבחרים ({selected.length})
                  </Button>
                )}
                {documents.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(documents.map((doc) => doc.id))}
                  >
                    בחר הכל
                  </Button>
                )}
                {canUpload && (
                  <>
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={pickDocument}
                      disabled={uploading}
                      className="hidden"
                    />
                    <Button variant="secondary" size="sm" onClick={() => setOpenDoc('new')} disabled={uploading}>
                      מסמך חדש
                    </Button>
                    <Button size="sm" onClick={() => docInputRef.current?.click()} disabled={uploading}>
                      העלה קובץ
                    </Button>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400">
              PDF, DOCX או TXT. עד 10MB או כ-100 עמודים. קובץ גדול יותר — פצל למסמכים נפרדים.
              לכל קובץ בוחרים כותרת לפני ההעלאה. אפשר גם לכתוב מסמך ידנית.
            </p>

            {loading ? (
              <p className="text-sm text-slate-400">טוען…</p>
            ) : documents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">אין מסמכים עדיין</div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="bg-slate-800/30 rounded-lg p-3 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      onChange={() => toggleSelected(doc.id)}
                      className="accent-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setOpenDoc(doc.id)}
                      className="flex-1 min-w-0 text-right"
                    >
                      <div className="font-medium text-white truncate">{doc.filename}</div>
                      <div className="text-xs text-slate-400">
                        {doc.file_type.toUpperCase()} • {formatFileSize(doc.file_size)} • {doc.chunk_count} חלקים
                        {doc.has_source ? '' : ' • בלי תצוגת מקור'}
                      </div>
                    </button>
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'tables' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-medium text-white">טבלאות</h3>
              {canUpload && (
                <div className="flex gap-2">
                  <input
                    ref={tableInputRef}
                    type="file"
                    accept=".csv"
                    onChange={pickTable}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button variant="secondary" size="sm" onClick={() => setCreatingTable(true)} disabled={uploading}>
                    טבלה חדשה
                  </Button>
                  <Button size="sm" onClick={() => tableInputRef.current?.click()} disabled={uploading}>
                    העלה CSV
                  </Button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">
              צפייה ועריכת תאים במסך. שמירה מעדכנת את החיפוש. אפשר להדביק מ-Excel.
            </p>

            {loading ? (
              <p className="text-sm text-slate-400">טוען…</p>
            ) : tables.length === 0 ? (
              <div className="text-center py-8 text-slate-400">אין טבלאות עדיין</div>
            ) : (
              <div className="space-y-2">
                {tables.map((table) => (
                  <div key={table.id} className="bg-slate-800/30 rounded-lg p-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenTable(table.id)}
                      className="flex-1 min-w-0 text-right"
                    >
                      <div className="font-medium text-white truncate">{table.name}</div>
                      <div className="text-xs text-slate-400">
                        {table.row_count} שורות • {Object.keys(table.columns).length} עמודות
                      </div>
                    </button>
                    <button
                      onClick={() => removeTable(table.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {pending && (
        <TitleDialog
          heading={pending.kind === 'document' ? 'כותרת למסמך' : 'שם לטבלה'}
          defaultValue={suggestedTitle(pending.file.name)}
          hint="הכותרת היא מה שהסוכן רואה בחיפוש."
          confirmLabel="העלה"
          onCancel={() => setPending(null)}
          onConfirm={confirmTitle}
        />
      )}

      {creatingTable && (
        <TitleDialog
          heading="טבלה חדשה"
          defaultValue=""
          hint="אחר כך אפשר להוסיף עמודות, שורות ולהדביק מ-Excel."
          confirmLabel="צור"
          onCancel={() => setCreatingTable(false)}
          onConfirm={createTable}
        />
      )}
    </div>
  );
}