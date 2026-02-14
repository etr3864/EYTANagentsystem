'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFollowupConfig, updateFollowupConfig, getFollowupStats } from '@/lib/api';
import type { FollowupConfig, FollowupStats, FollowupMetaTemplate, Provider } from '@/lib/types';
import { ModelSelect } from '@/components/ui/ModelSelect';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com')
    ? 'https://whatsapp-backend-6wwn.onrender.com'
    : 'http://localhost:8000');

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
// Helper functions
// ──────────────────────────────────────────

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
// Intervals editor
// ──────────────────────────────────────────

function IntervalsEditor({
  intervals, onChange,
}: {
  intervals: number[];
  onChange: (v: number[]) => void;
}) {
  function formatInterval(minutes: number): string {
    if (minutes < 60) return `${minutes} דקות`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} שעות`;
    return `${Math.round(minutes / 1440)} ימים`;
  }

  function addInterval() {
    const last = intervals[intervals.length - 1] || 120;
    onChange([...intervals, last * 2]);
  }

  function removeInterval(idx: number) {
    onChange(intervals.filter((_, i) => i !== idx));
  }

  function updateInterval(idx: number, val: number) {
    const next = [...intervals];
    next[idx] = val;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-300">מרווחי שליחה</label>
      {intervals.map((min, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-24">Follow-up {idx + 1}:</span>
          <input
            type="number"
            min={1}
            value={min}
            onChange={e => updateInterval(idx, parseInt(e.target.value) || 1)}
            className="w-24 px-2 py-1 bg-slate-800/50 border border-slate-600/50 rounded text-sm text-white"
          />
          <span className="text-xs text-slate-400">דקות ({formatInterval(min)})</span>
          {intervals.length > 1 && (
            <button
              onClick={() => removeInterval(idx)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              הסר
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addInterval}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        + הוסף מרווח
      </button>
    </div>
  );
}

// ──────────────────────────────────────────
// Meta template selector for follow-ups
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
    updateTemplate(idx, {
      name,
      language,
      params: new Array(paramCount).fill(''),
    });
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
        const res = await fetch(`${API_URL}/api/calendar/${agentId}/approved-templates`);
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
            onClick={() => updateField('enabled', !config.enabled)}
            className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${config.enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${config.enabled ? 'translate-x-0.5' : 'translate-x-5'}`} />
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
          {/* AI Model */}
          <ModelSelect
            label="מודל AI ליצירת Follow-up"
            value={config.model}
            onChange={e => updateField('model', e.target.value)}
          />

          {/* AI Instructions */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-300">
              הנחיות AI ל-Follow-up
            </label>
            <textarea
              value={config.ai_instructions}
              onChange={e => updateField('ai_instructions', e.target.value)}
              rows={4}
              placeholder="הנחיות לסוכן ה-AI מתי ואיך לשלוח follow-up. לדוגמה: אם הלקוח שאל על מחירים אבל לא קיבל הצעת מחיר, שלח follow-up עם הצעת מחיר..."
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Triggers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">זמן חוסר פעילות (דקות)</label>
              <input
                type="number"
                min={30}
                value={config.inactivity_minutes}
                onChange={e => updateField('inactivity_minutes', parseInt(e.target.value) || 120)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500">כמה דקות לחכות אחרי ההודעה האחרונה של הלקוח</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">מינימום הודעות בשיחה</label>
              <input
                type="number"
                min={1}
                value={config.min_messages}
                onChange={e => updateField('min_messages', parseInt(e.target.value) || 4)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500">מינימום הודעות שנשלחו לפני ששולחים follow-up</p>
            </div>
          </div>

          {/* Limits */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">מקסימום follow-ups</label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.max_followups}
                onChange={e => updateField('max_followups', parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500">לכל שיחה</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">צינון (שעות)</label>
              <input
                type="number"
                min={1}
                value={config.cooldown_hours}
                onChange={e => updateField('cooldown_hours', parseInt(e.target.value) || 12)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500">מינימום שעות בין follow-ups</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">מקסימום ליום</label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.max_per_day}
                onChange={e => updateField('max_per_day', parseInt(e.target.value) || 2)}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500">לכל שיחה ביום</p>
            </div>
          </div>

          {/* Active hours */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">שעות פעילות</label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={config.active_hours.start}
                onChange={e => updateField('active_hours', { ...config.active_hours, start: e.target.value })}
                className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <span className="text-slate-400">עד</span>
              <input
                type="time"
                value={config.active_hours.end}
                onChange={e => updateField('active_hours', { ...config.active_hours, end: e.target.value })}
                className="px-3 py-2 bg-slate-800/50 border border-slate-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500">שליחת follow-ups רק בתוך שעות אלו</p>
          </div>

          {/* Intervals */}
          <IntervalsEditor
            intervals={config.intervals_minutes}
            onChange={v => updateField('intervals_minutes', v)}
          />

          {/* Meta templates */}
          {isMeta && (
            <MetaTemplateSelector
              templates={config.meta_templates}
              approvedTemplates={approvedTemplates}
              onChange={v => updateField('meta_templates', v)}
            />
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
