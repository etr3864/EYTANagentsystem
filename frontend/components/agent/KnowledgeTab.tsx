'use client';

import { useState, useRef } from 'react';
import { Card, Button } from '@/components/ui';
import type { Document, DataTable } from '@/lib/types';

interface KnowledgeTabProps {
  documents: Document[];
  tables: DataTable[];
  onUploadDocument: (file: File, onProgress: (p: number) => void) => Promise<void>;
  onDeleteDocument: (id: number) => Promise<void>;
  onUploadTable: (file: File, name: string, onProgress: (p: number) => void) => Promise<void>;
  onDeleteTable: (id: number) => Promise<void>;
  canUpload?: boolean;
}

type Section = 'documents' | 'tables';

export function KnowledgeTab({
  documents, tables,
  onUploadDocument, onDeleteDocument,
  onUploadTable, onDeleteTable,
  canUpload = true
}: KnowledgeTabProps) {
  const [section, setSection] = useState<Section>('documents');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Table upload
  const [tableName, setTableName] = useState('');
  
  const docInputRef = useRef<HTMLInputElement>(null);
  const tableInputRef = useRef<HTMLInputElement>(null);

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'doc'].includes(ext || '')) {
      setError('סוג קובץ לא נתמך. יש להעלות PDF או DOCX');
      return;
    }
    
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('מעלה קובץ...');
    
    try {
      await onUploadDocument(file, (progress) => {
        setUploadProgress(progress);
        if (progress < 50) setUploadStatus('מעלה קובץ...');
        else if (progress < 75) setUploadStatus('מחלץ טקסט...');
        else if (progress < 100) setUploadStatus('יוצר embeddings...');
        else setUploadStatus('הושלם!');
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת מסמך');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleTableUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      setError('יש להעלות קובץ CSV');
      return;
    }
    
    const name = tableName.trim() || file.name.replace('.csv', '');
    
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('מעלה קובץ...');
    
    try {
      await onUploadTable(file, name, (progress) => {
        setUploadProgress(progress);
        if (progress < 50) setUploadStatus('מעלה קובץ...');
        else if (progress < 75) setUploadStatus('מעבד נתונים...');
        else if (progress < 100) setUploadStatus('יוצר embeddings...');
        else setUploadStatus('הושלם!');
      });
      setTableName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת טבלה');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('');
      if (tableInputRef.current) tableInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Section Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'documents' as Section, label: '📄 מסמכים', count: documents.length },
          { id: 'tables' as Section, label: '📊 טבלאות', count: tables.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${section === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }
            `}
          >
            {tab.label}
            <span className="mr-2 text-xs opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Card className="!bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm text-blue-300 mb-2">{uploadStatus}</div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <span className="text-blue-400 font-medium">{uploadProgress}%</span>
          </div>
        </Card>
      )}

      {/* Content */}
      <Card>
        {/* === Documents === */}
        {section === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white">מסמכים</h3>
              {canUpload && (
                <div>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleDocumentUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploading}
                  >
                    + העלה מסמך
                  </Button>
                </div>
              )}
            </div>

            {canUpload && (
              <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
                📎 פורמטים נתמכים: PDF, DOCX
                <br />
                המסמכים יחולקו לחלקים ויאונדקסו לחיפוש סמנטי
              </div>
            )}

            {documents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">📄</div>
                <div>אין מסמכים עדיין</div>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="bg-slate-800/30 rounded-lg p-3 flex items-center gap-3">
                    <span className="text-2xl">
                      {doc.file_type === 'pdf' ? '📕' : '📘'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{doc.filename}</div>
                      <div className="text-xs text-slate-400">
                        {formatFileSize(doc.file_size)} • {doc.chunk_count} חלקים
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === Tables === */}
        {section === 'tables' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white">טבלאות נתונים</h3>
              {canUpload && (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="שם הטבלה"
                    className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm w-32"
                  />
                  <input
                    ref={tableInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleTableUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => tableInputRef.current?.click()}
                    disabled={uploading}
                  >
                    + העלה CSV
                  </Button>
                </div>
              )}
            </div>

            {canUpload && (
              <div className="text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
                📊 העלה קבצי CSV עם מוצרים, שירותים או נתונים אחרים
                <br />
                הסוכן יוכל לחפש ולבצע שאילתות על הנתונים
              </div>
            )}

            {tables.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-4xl mb-2">📊</div>
                <div>אין טבלאות עדיין</div>
              </div>
            ) : (
              <div className="space-y-2">
                {tables.map(table => (
                  <div key={table.id} className="bg-slate-800/30 rounded-lg p-3 flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{table.name}</div>
                      <div className="text-xs text-slate-400">
                        {table.row_count} שורות • {Object.keys(table.columns).length} עמודות
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {Object.keys(table.columns).slice(0, 5).join(', ')}
                        {Object.keys(table.columns).length > 5 && '...'}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteTable(table.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
