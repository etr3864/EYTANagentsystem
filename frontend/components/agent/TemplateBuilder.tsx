'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';
import { uploadTemplateMedia } from '@/lib/api';
import type { WhatsAppTemplate, TemplateCategory } from '@/lib/types';

interface BuilderProps {
  agentId: number;
  onSubmit: (data: { name: string; language: string; category: string; components: Record<string, unknown>[]; header_handle?: string }) => Promise<void>;
  initialData?: WhatsAppTemplate;
  isEdit?: boolean;
}

type HeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

const CATEGORIES: { key: TemplateCategory; emoji: string; name: string; nameEn: string; desc: string; color: string }[] = [
  { key: 'MARKETING', emoji: '📣', name: 'שיווקי', nameEn: 'Marketing', desc: 'מבצעים, עדכונים, ניוזלטר', color: 'pink' },
  { key: 'UTILITY', emoji: '⚙️', name: 'שירותי', nameEn: 'Utility', desc: 'אישורים, עדכוני הזמנה, תזכורות', color: 'blue' },
  { key: 'AUTHENTICATION', emoji: '🔐', name: 'אימות', nameEn: 'Authentication', desc: 'קודי OTP, אימות דו-שלבי', color: 'green' },
];

const LANGUAGES = [
  { code: 'he', label: 'עברית' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'عربي' },
];

const NAME_REGEX = /^[a-z0-9_]*$/;

const MEDIA_ACCEPT: Record<string, string> = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4',
  DOCUMENT: 'application/pdf',
};

export function TemplateBuilder({ agentId, onSubmit, initialData, isEdit }: BuilderProps) {
  // Step 1: category selection, Step 2: builder
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media header upload state
  const [headerHandle, setHeaderHandle] = useState<string | null>(null);
  const [headerFileName, setHeaderFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [category, setCategory] = useState<TemplateCategory>(initialData?.category || 'UTILITY');
  const [name, setName] = useState(initialData?.name || '');
  const [language, setLanguage] = useState(initialData?.language || 'he');
  const [headerType, setHeaderType] = useState<HeaderType>(() => {
    const h = initialData?.components?.find((c: any) => c.type === 'HEADER') as any;
    return h ? h.format : 'NONE';
  });
  const [headerText, setHeaderText] = useState(() => {
    const h = initialData?.components?.find((c: any) => c.type === 'HEADER') as any;
    return h?.text || '';
  });
  const [bodyText, setBodyText] = useState(() => {
    const b = initialData?.components?.find((c: any) => c.type === 'BODY') as any;
    return b?.text || '';
  });
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [footerText, setFooterText] = useState(() => {
    const f = initialData?.components?.find((c: any) => c.type === 'FOOTER') as any;
    return f?.text || '';
  });
  const [buttons, setButtons] = useState<TemplateButton[]>(() => {
    const btns = initialData?.components?.find((c: any) => c.type === 'BUTTONS') as any;
    return btns?.buttons || [];
  });
  const [showJson, setShowJson] = useState(false);

  // Variable count in body
  const varMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
  const varCount = new Set(varMatches).size;

  // Keep bodyExamples in sync with actual variable count
  const trimmedExamples = bodyExamples.slice(0, varCount);

  // Build components for API
  const buildComponents = (): Record<string, unknown>[] => {
    const components: Record<string, unknown>[] = [];

    if (headerType !== 'NONE') {
      const header: Record<string, unknown> = { type: 'HEADER', format: headerType };
      if (headerType === 'TEXT') header.text = headerText;
      components.push(header);
    }

    const body: Record<string, unknown> = { type: 'BODY', text: bodyText };
    if (varCount > 0 && trimmedExamples.length > 0) {
      body.example = { body_text: [trimmedExamples] };
    }
    components.push(body);

    if (footerText.trim()) {
      components.push({ type: 'FOOTER', text: footerText });
    }

    if (buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: buttons.map(b => {
        const btn: Record<string, unknown> = { type: b.type, text: b.text };
        if (b.type === 'URL' && b.url) btn.url = b.url;
        if (b.type === 'PHONE_NUMBER' && b.phone_number) btn.phone_number = b.phone_number;
        return btn;
      })});
    }

    return components;
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const handle = await uploadTemplateMedia(agentId, file);
      setHeaderHandle(handle);
      setHeaderFileName(file.name);
    } catch (err: any) {
      setError(err.message || 'שגיאה בהעלאת קובץ');
    } finally {
      setUploading(false);
    }
  };

  const isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType);

  const handleSubmit = async () => {
    setError(null);

    if (!isEdit && !NAME_REGEX.test(name)) {
      setError('שם Template חייב להכיל רק אותיות קטנות באנגלית, מספרים וקו תחתון');
      return;
    }
    if (!name.trim()) { setError('שם Template חובה'); return; }
    if (!bodyText.trim()) { setError('תוכן ה-Body חובה'); return; }
    if (bodyText.length > 1024) { setError('Body מוגבל ל-1024 תווים'); return; }
    if (varCount > 0 && trimmedExamples.filter(Boolean).length < varCount) {
      setError('חובה למלא דוגמאות לכל המשתנים');
      return;
    }
    if (isMediaHeader && !headerHandle) {
      setError('חובה להעלות קובץ לדוגמה עבור header מדיה');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name, language, category,
        components: buildComponents(),
        header_handle: headerHandle || undefined,
      });
    } catch (e: any) {
      setError(e.message || 'שגיאה ביצירת template');
    } finally {
      setSubmitting(false);
    }
  };

  const addVariable = () => {
    const nextVar = varCount + 1;
    setBodyText((prev: string) => prev + `{{${nextVar}}}`);
    setBodyExamples((prev: string[]) => [...prev, '']);
  };

  const addButton = (type: ButtonType) => {
    if (buttons.length >= 3) return;
    setButtons(prev => [...prev, { type, text: '' }]);
  };

  const updateButton = (idx: number, updates: Partial<TemplateButton>) => {
    setButtons(prev => prev.map((b, i) => i === idx ? { ...b, ...updates } : b));
  };

  const removeButton = (idx: number) => {
    setButtons(prev => prev.filter((_, i) => i !== idx));
  };

  // Step 1: Category Selection
  if (step === 1) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">בחר סוג Template</h3>
          <p className="text-sm text-[var(--text-secondary)]">הסוג קובע את המחיר ואת מה ש-Meta מאשרת</p>
        </div>
        {CATEGORIES.map(cat => {
          const colorMap: Record<string, string> = {
            pink: 'hover:border-pink-500 hover:bg-pink-500/5',
            blue: 'hover:border-[var(--acc)] hover:bg-[var(--acc)]/5',
            green: 'hover:border-emerald-500 hover:bg-emerald-500/5',
          };
          return (
            <button
              key={cat.key}
              onClick={() => { setCategory(cat.key); setStep(2); }}
              className={`w-full text-right p-5 bg-[var(--glass)] border border-[var(--edge)] rounded-xl transition-all ${colorMap[cat.color] || ''}`}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{cat.emoji}</span>
                <div className="flex-1">
                  <div className="text-[var(--ink)] font-medium">{cat.name} <span className="text-[var(--text-muted)] text-sm">({cat.nameEn})</span></div>
                  <div className="text-sm text-[var(--text-secondary)] mt-0.5">{cat.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Step 2: Builder + Preview
  const isAuth = category === 'AUTHENTICATION';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      {/* Form */}
      <div className="space-y-5">
        {/* Back + category badge */}
        {!isEdit && (
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(1)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--ink)] transition-colors">← חזור</button>
            <span className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
              {CATEGORIES.find(c => c.key === category)?.emoji} {CATEGORIES.find(c => c.key === category)?.name}
            </span>
          </div>
        )}

        {/* Name + Language */}
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">שם Template</label>
            <input
              value={name}
              onChange={e => setName(e.target.value.toLowerCase())}
              disabled={isEdit}
              placeholder="order_confirm_he"
              className={`w-full px-3 py-2 bg-[var(--glass-2)] border rounded-lg text-[var(--ink)] font-mono text-sm ${
                name && !NAME_REGEX.test(name) ? 'border-red-500' : 'border-[var(--edge-strong)]'
              } ${isEdit ? 'opacity-50' : ''}`}
            />
            {name && !NAME_REGEX.test(name) && (
              <p className="text-xs text-red-400 mt-1">רק אותיות קטנות, מספרים וקו תחתון</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">שפה</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              disabled={isEdit}
              className={`w-full px-3 py-2 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded-lg text-[var(--ink)] text-sm ${isEdit ? 'opacity-50' : ''}`}
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Authentication - special block */}
        {isAuth ? (
          <Card className="border-emerald-800 bg-emerald-900/10">
            <div className="text-emerald-300 font-medium mb-2">🔐 Template אימות</div>
            <p className="text-sm text-[var(--text-secondary)]">Meta מייצרת את הטקסט אוטומטית. רק צור את ה-template ו-Meta תוסיף את קוד ה-OTP.</p>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">Header (אופציונלי)</label>
              <div className="flex gap-2 mb-2">
                {(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as HeaderType[]).map(ht => (
                  <button
                    key={ht}
                    onClick={() => { setHeaderType(ht); setHeaderHandle(null); setHeaderFileName(null); }}
                    className={`px-3 py-1.5 rounded text-xs transition-colors ${
                      headerType === ht ? 'bg-[var(--acc)]/20 border-[var(--acc)] text-[var(--acc)] border' : 'bg-[var(--glass-2)] text-[var(--text-secondary)] border border-[var(--edge)]'
                    }`}
                  >
                    {ht === 'NONE' ? 'ללא' : ht === 'TEXT' ? 'טקסט' : ht === 'IMAGE' ? 'תמונה' : ht === 'VIDEO' ? 'וידאו' : 'מסמך'}
                  </button>
                ))}
              </div>
              {headerType === 'TEXT' && (
                <input
                  value={headerText}
                  onChange={e => setHeaderText(e.target.value)}
                  maxLength={60}
                  placeholder="כותרת ההודעה"
                  className="w-full px-3 py-2 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded-lg text-[var(--ink)] text-sm"
                />
              )}
              {isMediaHeader && (
                <div className="bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg p-3 space-y-2">
                  <p className="text-xs text-[var(--text-secondary)]">Meta דורש קובץ לדוגמה לצורך אישור</p>
                  {headerHandle ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-400">✓ {headerFileName}</span>
                      <button onClick={() => { setHeaderHandle(null); setHeaderFileName(null); }} className="text-xs text-[var(--text-muted)] hover:text-red-400">שנה</button>
                    </div>
                  ) : (
                    <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      uploading ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' : 'bg-[var(--acc)]/20 text-[var(--acc)] hover:bg-[var(--acc)]/30'
                    }`}>
                      {uploading ? 'מעלה...' : 'בחר קובץ'}
                      <input type="file" className="hidden" accept={MEDIA_ACCEPT[headerType] || '*/*'} onChange={handleMediaUpload} disabled={uploading} />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-[var(--text-secondary)]">Body (חובה)</label>
                <span className="text-xs text-[var(--text-muted)]">{bodyText.length}/1024</span>
              </div>
              <textarea
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                maxLength={1024}
                rows={5}
                placeholder={'שלום {{1}}, ההזמנה שלך #{{2}} אושרה!'}
                className="w-full px-3 py-2 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded-lg text-[var(--ink)] text-sm resize-none"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={addVariable}
                  className="text-xs px-3 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-hover)] transition-colors"
                >
                  + הוסף משתנה
                </button>
                {varCount > 0 && <span className="text-xs text-[var(--text-muted)]">{varCount} משתנים</span>}
              </div>
            </div>

            {/* Variable Examples */}
            {varCount > 0 && (
              <div className="space-y-2 bg-[var(--glass)] border border-[var(--edge)] rounded-lg p-4">
                <label className="text-sm text-[var(--text-secondary)]">דוגמאות למשתנים (חובה לאישור Meta)</label>
                {Array.from({ length: varCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-[var(--acc)]/20 text-[var(--acc)] rounded font-mono">{`{{${i + 1}}}`}</span>
                    <input
                      value={trimmedExamples[i] || ''}
                      onChange={e => {
                        const next = [...trimmedExamples];
                        next[i] = e.target.value;
                        setBodyExamples(next);
                      }}
                      placeholder={`דוגמה למשתנה ${i + 1}`}
                      className="flex-1 px-3 py-1.5 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded text-[var(--ink)] text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Footer (אופציונלי)</label>
              <input
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                maxLength={60}
                placeholder="טקסט תחתון"
                className="w-full px-3 py-2 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded-lg text-[var(--ink)] text-sm"
              />
            </div>

            {/* Buttons */}
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-2">כפתורים (אופציונלי)</label>
              <div className="flex gap-2 mb-3">
                <button onClick={() => addButton('QUICK_REPLY')} disabled={buttons.length >= 3} className="text-xs px-3 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30">
                  💬 תגובה מהירה
                </button>
                <button onClick={() => addButton('URL')} disabled={buttons.length >= 3} className="text-xs px-3 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30">
                  🔗 קישור
                </button>
                <button onClick={() => addButton('PHONE_NUMBER')} disabled={buttons.length >= 3} className="text-xs px-3 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-30">
                  📞 טלפון
                </button>
              </div>
              {buttons.map((btn, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[var(--text-muted)] w-16">
                    {btn.type === 'QUICK_REPLY' ? '💬 תגובה' : btn.type === 'URL' ? '🔗 URL' : '📞 טלפון'}
                  </span>
                  <input
                    value={btn.text}
                    onChange={e => updateButton(idx, { text: e.target.value })}
                    maxLength={25}
                    placeholder="טקסט כפתור"
                    className="flex-1 px-3 py-1.5 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded text-[var(--ink)] text-sm"
                  />
                  {btn.type === 'URL' && (
                    <input
                      value={btn.url || ''}
                      onChange={e => updateButton(idx, { url: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1.5 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded text-[var(--ink)] text-sm font-mono"
                    />
                  )}
                  {btn.type === 'PHONE_NUMBER' && (
                    <input
                      value={btn.phone_number || ''}
                      onChange={e => updateButton(idx, { phone_number: e.target.value })}
                      placeholder="+972..."
                      className="w-40 px-3 py-1.5 bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded text-[var(--ink)] text-sm font-mono"
                    />
                  )}
                  <button onClick={() => removeButton(idx)} className="text-red-400 hover:text-red-300 text-sm">✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Error */}
        {error && <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">{error}</div>}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || (!isAuth && !bodyText.trim())}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 rounded-lg text-[var(--ink)] font-medium transition-colors text-sm"
          >
            {submitting ? 'שולח...' : isEdit ? 'עדכן ושלח לבדיקה' : 'שלח לאישור Meta'}
          </button>
        </div>

        {/* JSON Preview */}
        <details className="text-xs">
          <summary className="text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">JSON Preview</summary>
          <pre dir="ltr" className="mt-2 p-3 bg-[var(--bg-secondary)] border border-[var(--edge)] rounded-lg text-[var(--text-secondary)] overflow-x-auto">
            {JSON.stringify({ name, language, category, components: buildComponents() }, null, 2)}
          </pre>
        </details>
      </div>

      {/* Preview */}
      {!isAuth && (
        <div className="hidden lg:block">
          <label className="block text-xs text-[var(--text-muted)] mb-2 text-center">תצוגה מקדימה</label>
          <div className="bg-[var(--bg-secondary)] border border-[var(--edge)] rounded-2xl p-4 shadow-xl">
            {/* Phone header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--edge)]">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-[var(--ink)] text-xs font-bold">W</div>
              <div>
                <div className="text-sm text-[var(--ink)] font-medium">העסק שלך</div>
                <div className="text-[10px] text-[var(--text-muted)]">WhatsApp Business</div>
              </div>
            </div>

            {/* Message bubble */}
            <div className="bg-[var(--glass-2)] rounded-xl rounded-tr-sm p-3 max-w-full">
              {headerType === 'TEXT' && headerText && (
                <div className="font-bold text-[var(--ink)] text-sm mb-1">{headerText}</div>
              )}
              {isMediaHeader && (
                <div className="bg-[var(--bg-tertiary)] rounded-lg h-24 flex items-center justify-center text-[var(--text-muted)] text-xs mb-2">
                  {headerFileName
                    ? `${headerType === 'IMAGE' ? '🖼️' : headerType === 'VIDEO' ? '🎬' : '📄'} ${headerFileName}`
                    : headerType === 'IMAGE' ? '🖼️ תמונה' : headerType === 'VIDEO' ? '🎬 וידאו' : '📄 מסמך'}
                </div>
              )}
              <div className="text-sm text-[var(--ink)] whitespace-pre-wrap break-words">
                {bodyText.replace(/\{\{(\d+)\}\}/g, (_match: string, n: string) => `‹משתנה ${n}›`) || 'תוכן ההודעה...'}
              </div>
              {footerText && (
                <div className="text-[10px] text-[var(--text-muted)] mt-2">{footerText}</div>
              )}
              <div className="text-[10px] text-[var(--text-muted)] text-left mt-1">12:00 ✓✓</div>
            </div>

            {/* Buttons */}
            {buttons.length > 0 && (
              <div className="mt-1 space-y-1">
                {buttons.map((btn, i) => (
                  <div key={i} className="bg-[var(--glass-2)] rounded-lg py-2 text-center text-xs text-[var(--acc)]">
                    {btn.type === 'URL' ? '🔗' : btn.type === 'PHONE_NUMBER' ? '📞' : '💬'} {btn.text || 'כפתור'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
