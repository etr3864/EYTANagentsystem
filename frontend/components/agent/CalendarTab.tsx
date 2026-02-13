'use client';

import { useState, useEffect } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import { Input, Select, Textarea } from '@/components/ui/Input';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface WorkingHours {
  [day: string]: { start: string; end: string } | null;
}

interface ReminderRule {
  minutes_before: number;
  content_type: 'template' | 'ai' | 'meta_template';
  template?: string;
  ai_prompt?: string;
  meta_template_name?: string;
  meta_template_language?: string;
  parameter_mapping?: string[];
}

interface ApprovedTemplate {
  name: string;
  language: string;
  category: string;
  components: Array<{ type: string; text?: string; parameters?: Array<{ type: string }> }>;
}

interface RemindersConfig {
  enabled: boolean;
  rules: ReminderRule[];
}

interface CalendarConfig {
  connected?: boolean;
  google_calendar_id?: string;
  working_hours?: WorkingHours;
  timezone?: string;
  webhook_url?: string;
  reminders?: RemindersConfig;
}

interface GoogleCalendar {
  id: string;
  name: string;
  primary?: boolean;
}

interface CalendarTabProps {
  agentId: number;
  provider: 'meta' | 'wasender';
  appointmentPrompt: string;
  onAppointmentPromptChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}

const DAYS = [
  { key: '0', label: 'ראשון' },
  { key: '1', label: 'שני' },
  { key: '2', label: 'שלישי' },
  { key: '3', label: 'רביעי' },
  { key: '4', label: 'חמישי' },
  { key: '5', label: 'שישי' },
  { key: '6', label: 'שבת' },
];

const DEFAULT_WORKING_HOURS: WorkingHours = {
  '0': { start: '09:00', end: '17:00' },
  '1': { start: '09:00', end: '17:00' },
  '2': { start: '09:00', end: '17:00' },
  '3': { start: '09:00', end: '17:00' },
  '4': { start: '09:00', end: '17:00' },
  '5': null,
  '6': null,
};

const MINUTES_OPTIONS = [
  { value: 15, label: '15 דקות לפני' },
  { value: 30, label: '30 דקות לפני' },
  { value: 60, label: 'שעה לפני' },
  { value: 120, label: 'שעתיים לפני' },
  { value: 180, label: '3 שעות לפני' },
  { value: 360, label: '6 שעות לפני' },
  { value: 720, label: '12 שעות לפני' },
  { value: 1440, label: 'יום לפני' },
  { value: 2880, label: 'יומיים לפני' },
];

// Available variables for parameter mapping
const PARAM_VARIABLES = [
  { key: 'customer_name', label: 'שם הלקוח' },
  { key: 'title', label: 'כותרת הפגישה' },
  { key: 'date', label: 'תאריך' },
  { key: 'time', label: 'שעה' },
  { key: 'day', label: 'יום בשבוע' },
  { key: 'duration', label: 'משך (דקות)' },
  { key: 'agent_name', label: 'שם העסק' },
];


function extractBodyParamCount(components: ApprovedTemplate['components']): number {
  const body = components.find(c => c.type === 'BODY' || c.type === 'body');
  if (!body?.text) return 0;
  const matches = body.text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

function extractBodyText(components: ApprovedTemplate['components']): string {
  const body = components.find(c => c.type === 'BODY' || c.type === 'body');
  return body?.text || '';
}


function TestButton({ agentId, index }: { agentId: number; index: number }) {
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleSendTest() {
    if (!testPhone) return;
    setSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_URL}/api/calendar/${agentId}/test-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.replace(/\D/g, ''), rule_index: index }),
      });
      if (res.ok) {
        setTestResult({ success: true, message: 'נשלח בהצלחה!' });
        setTimeout(() => { setShowTest(false); setTestResult(null); }, 2000);
      } else {
        const data = await res.json();
        setTestResult({ success: false, message: data.detail || 'שליחה נכשלה' });
      }
    } catch {
      setTestResult({ success: false, message: 'שגיאת רשת' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-slate-700 pt-3">
      {!showTest ? (
        <button type="button" onClick={() => setShowTest(true)} className="text-sm text-blue-400 hover:text-blue-300">
          שלח הודעת טסט
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="972521234567"
            className="flex-1 px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
            dir="ltr"
          />
          <button type="button" onClick={handleSendTest} disabled={sending || !testPhone}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded">
            {sending ? '...' : 'שלח'}
          </button>
          <button type="button" onClick={() => { setShowTest(false); setTestResult(null); }}
            className="px-2 py-1.5 text-sm text-slate-400 hover:text-slate-300">ביטול</button>
        </div>
      )}
      {testResult && (
        <p className={`text-xs mt-1 ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.message}
        </p>
      )}
    </div>
  );
}


function MetaTemplateEditor({
  rule, index, onChange, approvedTemplates,
}: {
  rule: ReminderRule;
  index: number;
  onChange: (rule: ReminderRule) => void;
  approvedTemplates: ApprovedTemplate[];
}) {
  const selectedKey = rule.meta_template_name && rule.meta_template_language
    ? `${rule.meta_template_name}|${rule.meta_template_language}` : '';

  const selectedTpl = approvedTemplates.find(
    t => t.name === rule.meta_template_name && t.language === rule.meta_template_language
  );
  const paramCount = selectedTpl ? extractBodyParamCount(selectedTpl.components) : 0;
  const bodyText = selectedTpl ? extractBodyText(selectedTpl.components) : '';
  const mapping = rule.parameter_mapping || [];

  // Check if mapping is stale (wrong length)
  const mappingMismatch = selectedTpl && mapping.length !== paramCount;

  function handleTemplateSelect(value: string) {
    if (!value) {
      onChange({ ...rule, meta_template_name: undefined, meta_template_language: undefined, parameter_mapping: [] });
      return;
    }
    const [name, lang] = value.split('|');
    const tpl = approvedTemplates.find(t => t.name === name && t.language === lang);
    const count = tpl ? extractBodyParamCount(tpl.components) : 0;
    onChange({
      ...rule,
      meta_template_name: name,
      meta_template_language: lang,
      parameter_mapping: new Array(count).fill('customer_name'),
    });
  }

  function handleParamChange(paramIndex: number, variableKey: string) {
    const newMapping = [...mapping];
    newMapping[paramIndex] = variableKey;
    onChange({ ...rule, parameter_mapping: newMapping });
  }

  if (approvedTemplates.length === 0) {
    return (
      <div className="text-sm text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-3">
        אין תבניות WhatsApp מאושרות לסוכן זה. יש ליצור תבנית בטאב &quot;תבניות&quot; ולחכות לאישור Meta.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Select
        label="תבנית WhatsApp מאושרת"
        value={selectedKey}
        onChange={(e) => handleTemplateSelect(e.target.value)}
        options={[
          { value: '', label: 'בחר תבנית...' },
          ...approvedTemplates.map(t => ({
            value: `${t.name}|${t.language}`,
            label: `${t.name} (${t.language})`,
          })),
        ]}
      />

      {selectedTpl && (
        <>
          {/* Body preview */}
          <div className="p-3 bg-slate-900/50 border border-slate-700 rounded text-sm text-slate-300" dir="rtl">
            {bodyText || '(ללא טקסט body)'}
          </div>

          {/* Parameter mapping */}
          {paramCount > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">מיפוי פרמטרים ({paramCount}):</p>
              {Array.from({ length: paramCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-12 shrink-0">{`{{${i + 1}}}`}</span>
                  <select
                    value={mapping[i] || ''}
                    onChange={(e) => handleParamChange(i, e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  >
                    {PARAM_VARIABLES.map(v => (
                      <option key={v.key} value={v.key}>{v.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {mappingMismatch && (
            <p className="text-xs text-red-400">
              מספר הפרמטרים במיפוי ({mapping.length}) לא תואם לתבנית ({paramCount}). יש לבחור את התבנית מחדש.
            </p>
          )}
        </>
      )}
    </div>
  );
}


function WaSenderContentEditor({
  rule, index, onChange,
}: {
  rule: ReminderRule;
  index: number;
  onChange: (rule: ReminderRule) => void;
}) {
  const [localTemplate, setLocalTemplate] = useState(rule.template || '');
  const [localAiPrompt, setLocalAiPrompt] = useState(rule.ai_prompt || '');

  useEffect(() => {
    setLocalTemplate(rule.template || '');
    setLocalAiPrompt(rule.ai_prompt || '');
  }, [rule.template, rule.ai_prompt]);

  return (
    <>
      <div className="flex items-center gap-4 mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name={`content-type-${index}`}
            checked={rule.content_type === 'template'}
            onChange={() => onChange({ ...rule, content_type: 'template' })}
            className="w-4 h-4 bg-slate-700 border-slate-600" />
          <span className="text-sm text-slate-300">תבנית קבועה</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name={`content-type-${index}`}
            checked={rule.content_type === 'ai'}
            onChange={() => onChange({ ...rule, content_type: 'ai' })}
            className="w-4 h-4 bg-slate-700 border-slate-600" />
          <span className="text-sm text-slate-300">ניסוח AI</span>
        </label>
      </div>

      {rule.content_type === 'template' ? (
        <div>
          <Textarea label="תבנית הודעה" value={localTemplate}
            onChange={(e) => setLocalTemplate(e.target.value)}
            onBlur={() => onChange({ ...rule, template: localTemplate })}
            rows={3} placeholder="שלום {customer_name}, תזכורת לפגישה..." className="text-sm" dir="rtl" />
          <p className="text-xs text-slate-500 mt-1">
            משתנים זמינים: {'{customer_name}'}, {'{title}'}, {'{date}'}, {'{time}'}, {'{day}'}, {'{duration}'}, {'{agent_name}'}
          </p>
        </div>
      ) : (
        <div>
          <Textarea label="הנחיות ל-AI" value={localAiPrompt}
            onChange={(e) => setLocalAiPrompt(e.target.value)}
            onBlur={() => onChange({ ...rule, ai_prompt: localAiPrompt })}
            rows={2} placeholder="כתוב תזכורת חמה וידידותית..." className="text-sm" dir="rtl" />
          <p className="text-xs text-slate-500 mt-1">
            ה-AI יקבל את פרטי הפגישה, אישיות הסוכן והשיחה האחרונה - וינסח תזכורת מותאמת
          </p>
        </div>
      )}
    </>
  );
}


function ReminderRuleEditor({ 
  rule, index, onChange, onDelete, agentId, provider, approvedTemplates,
}: { 
  rule: ReminderRule; 
  index: number; 
  onChange: (rule: ReminderRule) => void; 
  onDelete: () => void;
  agentId: number;
  provider: 'meta' | 'wasender';
  approvedTemplates: ApprovedTemplate[];
}) {
  const isMeta = provider === 'meta';

  return (
    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">תזכורת {index + 1}</span>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">מחק</button>
      </div>

      <Select
        label="מתי לשלוח"
        value={rule.minutes_before}
        onChange={(e) => onChange({ ...rule, minutes_before: parseInt(e.target.value) })}
        options={MINUTES_OPTIONS.map(o => ({ value: o.value.toString(), label: o.label }))}
      />

      <div className="border-t border-slate-700 pt-3">
        {isMeta ? (
          <MetaTemplateEditor rule={rule} index={index} onChange={onChange} approvedTemplates={approvedTemplates} />
        ) : (
          <WaSenderContentEditor rule={rule} index={index} onChange={onChange} />
        )}
      </div>

      <TestButton agentId={agentId} index={index} />
    </div>
  );
}

export function CalendarTab({ 
  agentId, 
  provider,
  appointmentPrompt, 
  onAppointmentPromptChange,
  onSave, 
  saving 
}: CalendarTabProps) {
  const [config, setConfig] = useState<CalendarConfig>({});
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<ApprovedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const isMeta = provider === 'meta';

  useEffect(() => {
    loadConfig();
    if (isMeta) loadApprovedTemplates();
  }, [agentId, isMeta]);

  async function loadConfig() {
    try {
      const res = await fetch(`${API_URL}/api/calendar/${agentId}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        
        // If connected, load calendars
        if (data.connected) {
          loadCalendars();
        }
      }
    } catch (e) {
      console.error('Failed to load calendar config:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendars() {
    try {
      const res = await fetch(`${API_URL}/api/calendar/${agentId}/calendars`);
      if (res.ok) {
        const data = await res.json();
        setCalendars(data.calendars || []);
      }
    } catch (e) {
      console.error('Failed to load calendars:', e);
    }
  }

  async function loadApprovedTemplates() {
    try {
      const res = await fetch(`${API_URL}/api/calendar/${agentId}/approved-templates`);
      if (res.ok) {
        setApprovedTemplates(await res.json());
      }
    } catch {
      // Non-critical — templates will show as empty list
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch(`${API_URL}/api/calendar/${agentId}/oauth-url`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error('Failed to get OAuth URL:', e);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('לנתק את חיבור Google Calendar?')) return;
    
    try {
      await fetch(`${API_URL}/api/calendar/${agentId}/disconnect`, { method: 'DELETE' });
      setConfig({});
      setCalendars([]);
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  }

  async function saveConfig(newConfig: CalendarConfig) {
    try {
      await fetch(`${API_URL}/api/calendar/${agentId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      setConfig(newConfig);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  function handleWorkingHoursChange(day: string, field: 'start' | 'end', value: string) {
    const current = config.working_hours || DEFAULT_WORKING_HOURS;
    const dayHours = current[day];
    
    const newHours = {
      ...current,
      [day]: dayHours ? { ...dayHours, [field]: value } : { start: '09:00', end: '18:00', [field]: value }
    };
    
    saveConfig({ ...config, working_hours: newHours });
  }

  function toggleDay(day: string) {
    const current = config.working_hours || DEFAULT_WORKING_HOURS;
    const newHours = {
      ...current,
      [day]: current[day] ? null : { start: '09:00', end: '18:00' }
    };
    saveConfig({ ...config, working_hours: newHours });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isConnected = !!config.connected;
  const workingHours = config.working_hours || DEFAULT_WORKING_HOURS;

  return (
    <div className="space-y-6">
      {/* Google Calendar Connection */}
      <Card>
        <CardHeader>Google Calendar חיבור</CardHeader>
        
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="text-emerald-400 text-xl">✓</span>
              <span className="text-emerald-300">מחובר ל-Google Calendar</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDisconnect}
                className="mr-auto text-red-400 hover:text-red-300"
              >
                נתק
              </Button>
            </div>

            {/* Calendar Selection */}
            <div className="space-y-3">
              <Select
                label="יומן לתיאום פגישות"
                value={config.google_calendar_id || 'primary'}
                onChange={(e) => saveConfig({ ...config, google_calendar_id: e.target.value })}
                options={calendars.map(c => ({ 
                  value: c.primary ? 'primary' : c.id, 
                  label: c.name + (c.primary ? ' (ראשי)' : '') 
                }))}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-400 mb-4">
              חבר את Google Calendar כדי לאפשר תיאום פגישות
            </p>
            <Button 
              onClick={handleConnect} 
              disabled={connecting}
              loading={connecting}
            >
              התחבר ל-Google Calendar
            </Button>
          </div>
        )}
      </Card>

      {/* Working Hours */}
      {isConnected && (
        <Card>
          <CardHeader>שעות פעילות</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            הגדר את שעות הפעילות לתיאום פגישות
          </p>
          
          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const dayHours = workingHours[key];
              const isActive = !!dayHours;
              
              return (
                <div key={key} className="flex items-center gap-4 py-2">
                  <button
                    onClick={() => toggleDay(key)}
                    className={`w-20 text-sm font-medium text-right ${isActive ? 'text-white' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                  
                  {isActive ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={dayHours.start}
                        onChange={(e) => handleWorkingHoursChange(key, 'start', e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      />
                      <span className="text-slate-500">-</span>
                      <input
                        type="time"
                        value={dayHours.end}
                        onChange={(e) => handleWorkingHoursChange(key, 'end', e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      />
                      <button
                        onClick={() => toggleDay(key)}
                        className="text-xs text-slate-500 hover:text-red-400 mr-2"
                      >
                        השבת
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleDay(key)}
                      className="text-slate-500 text-sm hover:text-emerald-400"
                    >
                      יום מנוחה (לחץ להפעלה)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Webhook URL */}
      {isConnected && (
        <Card>
          <CardHeader>Webhook לאירועי פגישות</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            URL שיקבל התראות JSON בעת יצירה, שינוי או ביטול של פגישות (אופציונלי)
          </p>
          
          <Input
            label="Webhook URL"
            type="url"
            placeholder="https://example.com/webhook"
            value={config.webhook_url || ''}
            onChange={(e) => saveConfig({ ...config, webhook_url: e.target.value })}
          />
        </Card>
      )}

      {/* Appointment Reminders */}
      {isConnected && (
        <Card>
          <CardHeader>תזכורות לפגישות</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            שלח תזכורות אוטומטיות ללקוח לפני הפגישה
            {isMeta && ' (דרך תבניות WhatsApp מאושרות)'}
          </p>
          
          {/* Enable/Disable Toggle */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => {
                const reminders = config.reminders || { enabled: false, rules: [] };
                saveConfig({ ...config, reminders: { ...reminders, enabled: !reminders.enabled } });
              }}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                config.reminders?.enabled ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                config.reminders?.enabled ? 'right-1' : 'left-1'
              }`} />
            </button>
            <span className="text-sm text-slate-300">
              {config.reminders?.enabled ? 'תזכורות מופעלות' : 'תזכורות מושבתות'}
            </span>
          </div>

          {config.reminders?.enabled && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">חוקי תזכורת</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isMeta && approvedTemplates.length === 0}
                    onClick={() => {
                      const reminders = config.reminders || { enabled: true, rules: [] };
                      const newRule: ReminderRule = isMeta
                        ? { minutes_before: 60, content_type: 'meta_template' }
                        : { minutes_before: 60, content_type: 'template', template: 'שלום {customer_name}, תזכורת לפגישה "{title}" ב-{date} בשעה {time}. נתראה!' };
                      saveConfig({ ...config, reminders: { ...reminders, rules: [...reminders.rules, newRule] } });
                    }}
                  >
                    + הוסף תזכורת
                  </Button>
                </div>

                {isMeta && approvedTemplates.length === 0 && (
                  <p className="text-sm text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-3 text-center">
                    אין תבניות WhatsApp מאושרות. יש ליצור תבנית בטאב &quot;תבניות&quot; ולחכות לאישור Meta.
                  </p>
                )}

                {(!config.reminders?.rules || config.reminders.rules.length === 0) ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    אין חוקי תזכורת. לחץ &quot;הוסף תזכורת&quot; להוספת חוק חדש.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {config.reminders.rules.map((rule, idx) => (
                      <ReminderRuleEditor
                        key={idx}
                        rule={rule}
                        index={idx}
                        agentId={agentId}
                        provider={provider}
                        approvedTemplates={approvedTemplates}
                        onChange={(updatedRule) => {
                          const rules = [...(config.reminders?.rules || [])];
                          rules[idx] = updatedRule;
                          saveConfig({ ...config, reminders: { ...config.reminders!, rules } });
                        }}
                        onDelete={() => {
                          const rules = (config.reminders?.rules || []).filter((_, i) => i !== idx);
                          saveConfig({ ...config, reminders: { ...config.reminders!, rules } });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Appointment Prompt */}
      <Card>
        <CardHeader>הנחיות לתיאום פגישות</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          הנחיות נוספות לסוכן בנוגע לתיאום פגישות (סוג פגישה, משך, מיקום וכו')
        </p>
        
        <Textarea
          value={appointmentPrompt}
          onChange={(e) => onAppointmentPromptChange(e.target.value)}
          rows={8}
          placeholder={`דוגמה:
- סוג הפגישות: פגישת ייעוץ פרונטלית
- משך פגישה ברירת מחדל: 60 דקות
- מיקום: רח' הרצל 10, תל אביב
- תזכיר ללקוח להביא תעודת זהות`}
          className="font-mono text-sm"
        />
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button 
          onClick={onSave} 
          disabled={saving} 
          loading={saving}
          variant="success"
          size="lg"
        >
          שמור הגדרות
        </Button>
      </div>
    </div>
  );
}
