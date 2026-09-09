'use client';

import { useEffect, useState } from 'react';
import type { WhatsAppTemplate } from '@/lib/types';
import {
  fillTemplateBody,
  templateFooterText,
  templateHeaderFormat,
  templateVarCount,
} from '@/lib/whatsappWindow';

export interface TemplateSendPayload {
  templateId: number;
  bodyParams: string[];
  headerFile?: File;
}

interface TemplateComposerProps {
  templates: WhatsAppTemplate[];
  onSend: (payload: TemplateSendPayload) => Promise<void>;
  error: string | null;
  setError: (v: string | null) => void;
}

export function TemplateComposer({
  templates,
  onSend,
  error,
  setError,
}: TemplateComposerProps) {
  const approved = templates.filter(t => t.status === 'APPROVED');
  const [templateId, setTemplateId] = useState<number | ''>(approved[0]?.id ?? '');
  const [params, setParams] = useState<string[]>([]);
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const firstId = approved[0]?.id;
  const tpl = approved.find(t => t.id === templateId) || null;
  const varCount = tpl ? templateVarCount(tpl) : 0;
  const headerFmt = tpl ? templateHeaderFormat(tpl) : 'NONE';
  const needsHeader = headerFmt === 'IMAGE' || headerFmt === 'VIDEO' || headerFmt === 'DOCUMENT';
  const preview = tpl ? fillTemplateBody(tpl, params) : '';
  const footer = tpl ? templateFooterText(tpl) : '';

  useEffect(() => {
    if (!templateId && firstId) setTemplateId(firstId);
  }, [firstId, templateId]);

  useEffect(() => {
    setParams(prev => Array.from({ length: varCount }, (_, i) => prev[i] || ''));
    setHeaderFile(null);
  }, [templateId, varCount]);

  if (approved.length === 0) {
    return (
      <p className="text-sm text-amber-300">
        אין תבניות מאושרות. מחוץ לחלון 24 שעות אפשר לשלוח רק תבנית.
      </p>
    );
  }

  async function handleSend() {
    if (!tpl) return;
    if (varCount && params.slice(0, varCount).some(p => !p.trim())) {
      setError('מלא את כל משתני התבנית');
      return;
    }
    if (needsHeader && !headerFile && !tpl.header_media_url) {
      setError('חסר קובץ לכותרת התבנית');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend({
        templateId: tpl.id,
        bodyParams: params.slice(0, varCount),
        headerFile: headerFile || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחת התבנית נכשלה');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        value={templateId}
        onChange={e => setTemplateId(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white text-sm"
      >
        {approved.map(t => (
          <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
        ))}
      </select>
      {needsHeader && (
        <label className="block text-xs text-slate-300 space-y-1">
          <span>קובץ כותרת ({headerFmt === 'IMAGE' ? 'תמונה' : headerFmt === 'VIDEO' ? 'וידאו' : 'קובץ'})</span>
          <input
            type="file"
            accept={headerFmt === 'IMAGE' ? 'image/*' : headerFmt === 'VIDEO' ? 'video/*' : '*/*'}
            onChange={e => setHeaderFile(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-400"
          />
        </label>
      )}
      {Array.from({ length: varCount }, (_, i) => (
        <input
          key={i}
          type="text"
          value={params[i] || ''}
          onChange={e => {
            const next = [...params];
            next[i] = e.target.value;
            setParams(next);
          }}
          placeholder={`משתנה {{${i + 1}}}`}
          className="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white text-sm placeholder-slate-400"
        />
      ))}
      {tpl && (
        <div className="rounded-lg bg-slate-900/50 border border-slate-700 px-3 py-2 text-sm text-slate-200 whitespace-pre-wrap">
          {(headerFile || tpl.header_media_url) && needsHeader && headerFmt === 'IMAGE' && (
            <img
              src={headerFile ? URL.createObjectURL(headerFile) : tpl.header_media_url || ''}
              alt=""
              className="max-h-28 rounded mb-2 object-cover"
            />
          )}
          {preview || <span className="text-slate-500">תצוגה מקדימה</span>}
          {footer && <div className="text-[11px] text-slate-500 mt-2">{footer}</div>}
        </div>
      )}
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={sending}
        className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white font-medium"
      >
        {sending ? 'שולח...' : 'שלח תבנית'}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
