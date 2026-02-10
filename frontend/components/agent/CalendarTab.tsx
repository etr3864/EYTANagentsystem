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
  content_type: 'template' | 'ai';
  template?: string;
  ai_prompt?: string;
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

function ReminderRuleEditor({ 
  rule, 
  index, 
  onChange, 
  onDelete,
  agentId 
}: { 
  rule: ReminderRule; 
  index: number; 
  onChange: (rule: ReminderRule) => void; 
  onDelete: () => void;
  agentId: number;
}) {
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
        setTimeout(() => {
          setShowTest(false);
          setTestResult(null);
        }, 2000);
      } else {
        const data = await res.json();
        setTestResult({ success: false, message: data.detail || 'שליחה נכשלה' });
      }
    } catch (e) {
      setTestResult({ success: false, message: 'שגיאת רשת' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">תזכורת {index + 1}</span>
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-300"
        >
          מחק
        </button>
      </div>

      {/* Timing */}
      <Select
        label="מתי לשלוח"
        value={rule.minutes_before}
        onChange={(e) => onChange({ ...rule, minutes_before: parseInt(e.target.value) })}
        options={MINUTES_OPTIONS.map(o => ({ value: o.value.toString(), label: o.label }))}
      />

      {/* Content Type */}
      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center gap-4 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`content-type-${index}`}
              checked={rule.content_type === 'template'}
              onChange={() => onChange({ ...rule, content_type: 'template' })}
              className="w-4 h-4 bg-slate-700 border-slate-600"
            />
            <span className="text-sm text-slate-300">תבנית קבועה</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`content-type-${index}`}
              checked={rule.content_type === 'ai'}
              onChange={() => onChange({ ...rule, content_type: 'ai' })}
              className="w-4 h-4 bg-slate-700 border-slate-600"
            />
            <span className="text-sm text-slate-300">ניסוח AI</span>
          </label>
        </div>

        {rule.content_type === 'template' ? (
          <div>
            <Textarea
              label="תבנית הודעה"
              value={rule.template || ''}
              onChange={(e) => onChange({ ...rule, template: e.target.value })}
              rows={3}
              placeholder="שלום {customer_name}, תזכורת לפגישה..."
              className="text-sm"
              dir="rtl"
            />
            <p className="text-xs text-slate-500 mt-1">
              משתנים זמינים: {'{customer_name}'}, {'{title}'}, {'{date}'}, {'{time}'}, {'{day}'}, {'{duration}'}, {'{agent_name}'}
            </p>
          </div>
        ) : (
          <div>
            <Textarea
              label="הנחיות ל-AI"
              value={rule.ai_prompt || ''}
              onChange={(e) => onChange({ ...rule, ai_prompt: e.target.value })}
              rows={2}
              placeholder="כתוב תזכורת חמה וידידותית..."
              className="text-sm"
              dir="rtl"
            />
            <p className="text-xs text-slate-500 mt-1">
              ה-AI יקבל את פרטי הפגישה, אישיות הסוכן והשיחה האחרונה - וינסח תזכורת מותאמת
            </p>
          </div>
        )}
      </div>

      {/* Test Button */}
      <div className="border-t border-slate-700 pt-3">
        {!showTest ? (
          <button
            type="button"
            onClick={() => setShowTest(true)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
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
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sending || !testPhone}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white rounded"
            >
              {sending ? '...' : 'שלח'}
            </button>
            <button
              type="button"
              onClick={() => { setShowTest(false); setTestResult(null); }}
              className="px-2 py-1.5 text-sm text-slate-400 hover:text-slate-300"
            >
              ביטול
            </button>
          </div>
        )}
        {testResult && (
          <p className={`text-xs mt-1 ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  );
}

export function CalendarTab({ 
  agentId, 
  appointmentPrompt, 
  onAppointmentPromptChange,
  onSave, 
  saving 
}: CalendarTabProps) {
  const [config, setConfig] = useState<CalendarConfig>({});
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, [agentId]);

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
          <p className="text-sm text-slate-400 mb-2">
            שלח תזכורות אוטומטיות ללקוח ו/או לבעל העסק לפני הפגישה
          </p>
          <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 mb-4">
            שים לב: שליחת תזכורות בWhatsApp פועלת כרגע רק עם WA Sender. 
            עבור WhatsApp רשמי (Meta) נדרשים Templates מאושרים (בפיתוח).
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
              {/* Reminder Rules */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-300">חוקי תזכורת</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const reminders = config.reminders || { enabled: true, rules: [] };
                      const newRule: ReminderRule = {
                        minutes_before: 60,
                        content_type: 'template',
                        template: 'שלום {customer_name}, תזכורת לפגישה "{title}" ב-{date} בשעה {time}. נתראה!'
                      };
                      saveConfig({ ...config, reminders: { ...reminders, rules: [...reminders.rules, newRule] } });
                    }}
                  >
                    + הוסף תזכורת
                  </Button>
                </div>

                {(!config.reminders?.rules || config.reminders.rules.length === 0) ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    אין חוקי תזכורת. לחץ "הוסף תזכורת" להוספת חוק חדש.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {config.reminders.rules.map((rule, idx) => (
                      <ReminderRuleEditor
                        key={idx}
                        rule={rule}
                        index={idx}
                        agentId={agentId}
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
