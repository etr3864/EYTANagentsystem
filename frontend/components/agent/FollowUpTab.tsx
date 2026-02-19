'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFollowupConfig, updateFollowupConfig, getFollowupStats, authFetch, API_URL } from '@/lib/api';
import type { FollowupConfig, FollowupStats, FollowupStep, FollowupMetaTemplate, Provider } from '@/lib/types';
import { ModelSelect } from '@/components/ui/ModelSelect';

interface ApprovedTemplate {
  name: string;
  language: string;
  category: string;
  components: Array<{ type: string; text?: string; parameters?: Array<{ type: string }> }>;
}

interface FollowUpTabProps {
  agentId: number;
  provider: Provider;
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

function formatDelay(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} דקות`;
  if (hours < 24) return `${hours} שעות`;
  const days = Math.round(hours / 24 * 10) / 10;
  return days === 1 ? 'יום אחד' : `${days} ימים`;
}

function extractBodyText(components: ApprovedTemplate['components']): string {
  const body = components.find(c => c.type === 'BODY' || c.type === 'body');
  return body?.text || '';
}

function extractBodyParamCount(components: ApprovedTemplate['components']): number {
  const body = components.find(c => c.type === 'BODY' || c.type === 'body');
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

const AVAILABLE_VARIABLES = [
  { key: 'customer_name', label: 'שם הלקוח' },
  { key: 'agent_name', label: 'שם הסוכן' },
  { key: 'business_name', label: 'שם העסק' },
];

// ──────────────────────────────────────────
// Stats bar
// ──────────────────────────────────────────

function StatsBar({ stats }: { stats: FollowupStats | null }) {
  if (!stats) return null;
  const items = [
    { label: 'סה"כ', value: stats.total, color: 'text-slate-300' },
    { label: 'ממתינים', value: stats.pending, color: 'text-yellow-400' },
    { label: 'נשלחו', value: stats.sent, color: 'text-green-400' },
    { label: 'דולגו', value: stats.skipped, color: 'text-slate-400' },
    { label: 'בוטלו', value: stats.cancelled, color: 'text-red-400' },
  ];
  return (
    <div className="flex gap-4 flex-wrap text-sm">
      {items.map(s => (
        <span key={s.label} className={s.color}>
          {s.label}: <strong>{s.value}</strong>
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────
// Sequence builder
// ──────────────────────────────────────────

function SequenceBuilder({
  sequence, onChange,
}: {
  sequence: FollowupStep[];
  onChange: (s: FollowupStep[]) => void;
}) {
  function addStep() {
    const lastDelay = sequence[sequence.length - 1]?.delay_hours || 3;
    onChange([...sequence, { delay_hours: lastDelay * 2, instruction: '' }]);
  }

  function removeStep(idx: number) {
    if (sequence.length <= 1) return;
    onChange(sequence.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, field: keyof FollowupStep, value: string | number) {
    const next = [...sequence];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">רצף מעקב</label>
      <p className="text-xs text-slate-500">
        כל שלב מוגדר עם זמן המתנה והנחיה ל-AI. אם הלקוח חוזר לדבר, הרצף מתאפס.
      </p>

      {sequence.map((step, idx) => (
        <div key={idx} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-400 min-w-[60px]">שלב {idx + 1}</span>
            <span className="text-xs text-slate-400">אחרי</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={step.delay_hours}
              onChange={e => updateStep(idx, 'delay_hours', parseFloat(e.target.value) || 1)}
              className="w-20 px-2 py-1 bg-slate-800 border border-slate-600/50 rounded text-sm text-white text-center"
            />
            <span className="text-xs text-slate-400">שעות ({formatDelay(step.delay_hours)})</span>
            <div className="flex-1" />
            {sequence.length > 1 && (
              <button
                onClick={() => removeStep(idx)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                הסר
              </button>
            )}
          </div>
          <textarea
            value={step.instruction}
            onChange={e => updateStep(idx, 'instruction', e.target.value)}
            rows={2}
            placeholder="הנחיה ל-AI לשלב הזה (אופציונלי). לדוגמה: שאל אם יש שאלות נוספות..."
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/30 rounded text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500/50"
          />
        </div>
      ))}

      <button
        onClick={addStep}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        + הוסף שלב
      </button>
    </div>
  );
}

// ──────────────────────────────────────────
// Meta template selector
// ──────────────────────────────────────────

function MetaTemplateSelector({
  templates, approvedTemplates, onChange,
}: {
  templates: FollowupMetaTemplate[];
  approvedTemplates: ApprovedTemplate[];
  onChange: (templates: FollowupMetaTemplate[]) => void;
}) {
  function addTemplate() {
    if (approvedTemplates.length === 0) return;
    const first = approvedTemplates[0];
    const paramCount = extractBodyParamCount(first.components);
    onChange([...templates, {
      name: first.name,
      language: first.language,
      params: new Array(paramCount).fill(''),
    }]);
  }

  function removeTemplate(idx: number) {
    onChange(templates.filter((_, i) => i !== idx));
  }

  function updateTemplate(idx: number, tpl: FollowupMetaTemplate) {
    const next = [...templates];
    next[idx] = tpl;
    onChange(next);
  }

  function handleSelect(idx: number, key: string) {
    const [name, language] = key.split('|');
    const approved = approvedTemplates.find(t => t.name === name && t.language === language);
    if (!approved) return;
    const paramCount = extractBodyParamCount(approved.components);
    updateTemplate(idx, { name, language, params: new Array(paramCount).fill('') });
  }

  if (approvedTemplates.length === 0) {
    return (
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
        אין Templates מאושרים. צור Templates בטאב Templates ושלח לאישור Meta לפני שתוכל להשתמש בהם.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">
        Templates ל-Meta (חלון 24+ שעות)
      </label>
      <p className="text-xs text-slate-400">
        כשעברו 24 שעות מההודעה האחרונה של הלקוח, ה-AI יבחר מתוך הרשימה הזאת.
      </p>

      {templates.map((tpl, idx) => {
        const key = `${tpl.name}|${tpl.language}`;
        const approved = approvedTemplates.find(t => t.name === tpl.name && t.language === tpl.language);
        const bodyText = approved ? extractBodyText(approved.components) : '';
        const paramCount = tpl.params.length;

        return (
          <div key={idx} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={key}
                onChange={e => handleSelect(idx, e.target.value)}
                className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600/50 rounded text-sm text-white"
              >
                {approvedTemplates.map(t => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeTemplate(idx)}
                className="text-red-400 hover:text-red-300 text-sm px-2"
              >
                הסר
              </button>
            </div>

            {bodyText && (
              <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded" dir="rtl">
                {bodyText}
              </div>
            )}

            {paramCount > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-slate-400">מיפוי פרמטרים:</span>
                {tpl.params.map((param, pIdx) => (
                  <div key={pIdx} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 w-16">{`{{${pIdx + 1}}}`}</span>
                    <select
                      value={param}
                      onChange={e => {
                        const newParams = [...tpl.params];
                        newParams[pIdx] = e.target.value;
                        updateTemplate(idx, { ...tpl, params: newParams });
                      }}
                      className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600/50 rounded text-white"
                    >
                      <option value="">בחר משתנה...</option>
                      {AVAILABLE_VARIABLES.map(v => (
                        <option key={v.key} value={v.key}>{v.label} ({v.key})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addTemplate}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        + הוסף Template
      </button>
    </div>
  );
}

// ──────────────────────────────────────────
// Main component
// ──────────────────────────────────────────

export default function FollowUpTab({ agentId, provider }: FollowUpTabProps) {
  const [config, setConfig] = useState<FollowupConfig | null>(null);
  const [stats, setStats] = useState<FollowupStats | null>(null);
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMeta = provider === 'meta';

  const loadData = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([
        getFollowupConfig(agentId),
        getFollowupStats(agentId),
      ]);
      setConfig(cfg);
      setStats(st);

      if (isMeta) {
        const res = await authFetch(`${API_URL}/api/calendar/${agentId}/approved-templates`);
        if (res.ok) setApprovedTemplates(await res.json());
      }
    } catch {
      setMsg('שגיאה בטעינת הגדרות');
    } finally {
      setLoading(false);
    }
  }, [agentId, isMeta]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setMsg('');
    try {
      const updated = await updateFollowupConfig(agentId, config);
      setConfig(updated);
      setMsg('נשמר בהצלחה');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof FollowupConfig>(key: K, value: FollowupConfig[K]) {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-400">טוען...</div>;
  }

  if (!config) {
    return <div className="text-center py-8 text-red-400">שגיאה בטעינת הגדרות Follow-up</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Follow-Up אוטומטי</h3>
          <p className="text-sm text-slate-400 mt-1">
            הודעות מעקב אוטומטיות ללקוחות שהפסיקו להגיב
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-slate-300">{config.enabled ? 'פעיל' : 'כבוי'}</span>
          <div
            dir="ltr"
            onClick={() => updateField('enabled', !config.enabled)}
            className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${config.enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${config.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </div>
        </label>
      </div>

      <StatsBar stats={stats} />

      {!config.enabled && (
        <div className="p-3 bg-slate-800/30 border border-slate-700 rounded-lg text-sm text-slate-400 text-center">
          הפעל את ה-Follow-up כדי להתחיל לשלוח הודעות מעקב אוטומטיות
        </div>
      )}

      {config.enabled && (
        <div className="space-y-6">
          {/* General AI instruction */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">הנחיות כלליות ל-AI</label>
            <textarea
              value={config.general_instruction || ''}
              onChange={e => updateField('general_instruction', e.target.value)}
              rows={3}
              placeholder="הנחיות שיחולו על כל שלבי המעקב. לדוגמה: תתמקד במכירת קורס X, אל תציע הנחות..."
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500">אופציונלי. אם ריק, ה-AI עובד לפי היסטוריית השיחה ואישיות הסוכן בלבד.</p>
          </div>

          {/* Sequence builder */}
          <SequenceBuilder
            sequence={config.sequence || [{ delay_hours: 3, instruction: '' }]}
            onChange={s => updateField('sequence', s)}
          />

          {/* Active hours */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">שעות פעילות</label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={config.active_hours?.start || '09:00'}
                onChange={e => updateField('active_hours', { ...config.active_hours, start: e.target.value })}
                className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <span className="text-slate-400">עד</span>
              <input
                type="time"
                value={config.active_hours?.end || '21:00'}
                onChange={e => updateField('active_hours', { ...config.active_hours, end: e.target.value })}
                className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500">שליחת follow-ups רק בתוך שעות אלו</p>
          </div>

          {/* Min messages */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">מינימום הודעות בשיחה</label>
            <input
              type="number"
              min={1}
              max={50}
              value={config.min_messages}
              onChange={e => updateField('min_messages', parseInt(e.target.value) || 5)}
              className="w-32 px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-500">מינימום הודעות לפני ששולחים follow-up</p>
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            {showAdvanced ? '▼' : '▶'} הגדרות מתקדמות
          </button>

          {showAdvanced && (
            <div className="space-y-6 pl-2 border-r-2 border-slate-700 pr-4">
              <ModelSelect
                label="מודל AI ליצירת Follow-up"
                value={config.model}
                onChange={e => updateField('model', e.target.value)}
              />

              {isMeta && (
                <MetaTemplateSelector
                  templates={config.meta_templates || []}
                  approvedTemplates={approvedTemplates}
                  onChange={v => updateField('meta_templates', v)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm font-medium"
        >
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </button>
        {msg && (
          <span className={`text-sm ${msg.includes('שגיאה') ? 'text-red-400' : 'text-green-400'}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
