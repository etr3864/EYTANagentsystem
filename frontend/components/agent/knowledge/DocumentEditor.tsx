'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input, Textarea } from '@/components/ui';
import { createTextDocument, getDocument, updateDocument } from '@/lib/api';
import { MAX_SOURCE_CHARS, SOURCE_TOO_LONG } from './limits';

interface DocumentEditorProps {
  agentId: number;
  docId: number | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditor({
  agentId, docId, canEdit, onClose, onSaved,
}: DocumentEditorProps) {
  const isNew = docId == null;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasSource, setHasSource] = useState(isNew);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getDocument(agentId, docId);
        if (cancelled) return;
        setTitle(doc.filename);
        setHasSource(Boolean(doc.source_text));
        setContent(doc.source_text || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId, docId, isNew]);

  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('חובה לתת כותרת');
      return;
    }
    if (isNew && !content.trim()) {
      setError('חובה להזין תוכן');
      return;
    }
    if (hasSource && content.length > MAX_SOURCE_CHARS) {
      setError(SOURCE_TOO_LONG);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await createTextDocument(agentId, nextTitle, content);
      } else if (hasSource) {
        await updateDocument(agentId, docId, { title: nextTitle, content });
      } else {
        await updateDocument(agentId, docId, { title: nextTitle });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-white">
            {isNew ? 'מסמך חדש' : 'עריכת מסמך'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>חזרה</Button>
        </div>

        {loading && <p className="text-sm text-slate-400">טוען…</p>}

        {!loading && (
          <>
            <Input
              label="כותרת"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
            />

            {hasSource ? (
              <Textarea
                label="תוכן"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!canEdit}
                className="min-h-[320px] font-mono text-sm"
                hint={`הטקסט הזה הוא מה שנשמר במאגר. שמירה מחדש תעדכן את החיפוש. ${content.length.toLocaleString()} / ${MAX_SOURCE_CHARS.toLocaleString()} תווים.`}
              />
            ) : (
              <div className="text-sm text-slate-400 bg-slate-800/40 rounded-lg p-3">
                המסמך הועלה לפני שהתחלנו לשמור את הטקסט המלא. אין תצוגה או עריכת תוכן —
                העלה אותו מחדש עם כותרת כדי לקבל את זה.
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {canEdit && (
              <div className="flex justify-end">
                <Button
                  onClick={save}
                  loading={saving}
                  disabled={hasSource && content.length > MAX_SOURCE_CHARS}
                >
                  שמור
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}