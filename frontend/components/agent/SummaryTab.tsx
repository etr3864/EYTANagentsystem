'use client';

import { useState, useEffect } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';
import { Input, Textarea } from '@/components/ui/Input';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SummaryConfig {
  enabled: boolean;
  delay_minutes: number;
  min_messages: number;
  webhook_url: string;
  webhook_retry_count: number;
  webhook_retry_delay: number;
  summary_prompt: string;
}

interface SummaryTabProps {
  agentId: number;
}

export function SummaryTab({ agentId }: SummaryTabProps) {
  const [config, setConfig] = useState<SummaryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, [agentId]);

  async function loadConfig() {
    try {
      const res = await fetch(`${API_URL}/api/summaries/${agentId}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch {
      showFeedback('error', 'שגיאה בטעינת הגדרות');
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(updates: Partial<SummaryConfig>) {
    if (!config) return;
    setConfig({ ...config, ...updates });
    setHasChanges(true);
  }

  async function saveConfig() {
    if (!config) return;
    
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/summaries/${agentId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (res.ok) {
        setHasChanges(false);
        showFeedback('success', 'נשמר בהצלחה!');
      } else {
        const data = await res.json();
        showFeedback('error', data.detail || 'שגיאה בשמירה');
      }
    } catch {
      showFeedback('error', 'שגיאת רשת');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!config) return;
    
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/summaries/${agentId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      
      if (res.ok) {
        setConfig({ ...config, enabled: !config.enabled });
        showFeedback('success', config.enabled ? 'סיכומים הושבתו' : 'סיכומים הופעלו');
      }
    } catch {
      showFeedback('error', 'שגיאת רשת');
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    if (!config?.webhook_url) {
      showFeedback('error', 'יש להזין Webhook URL');
      return;
    }
    
    setTestingWebhook(true);
    try {
      const res = await fetch(`${API_URL}/api/summaries/${agentId}/test-webhook`, {
        method: 'POST',
      });
      
      if (res.ok) {
        showFeedback('success', 'Webhook נשלח בהצלחה!');
      } else {
        const data = await res.json();
        showFeedback('error', data.detail || 'שליחה נכשלה');
      }
    } catch {
      showFeedback('error', 'שגיאת רשת');
    } finally {
      setTestingWebhook(false);
    }
  }

  function showFeedback(type: 'success' | 'error', text: string) {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 3000);
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`
          fixed top-20 left-1/2 -translate-x-1/2 z-50
          px-4 py-3 rounded-lg shadow-lg
          flex items-center gap-2
          animate-fade-in
          ${feedback.type === 'success' 
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300' 
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }
        `}>
          {feedback.type === 'success' ? '✓' : '✕'}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Enable/Disable */}
      <Card>
        <CardHeader>סיכומי שיחות אוטומטיים</CardHeader>
        <p className="text-sm text-slate-400 mb-4">
          הפעל יצירת סיכומים אוטומטיים לשיחות ושליחתם ל-Webhook חיצוני
        </p>
        
        <div className="flex items-center gap-3">
          <button
            onClick={toggleEnabled}
            disabled={saving}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.enabled ? 'bg-emerald-500' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
              config.enabled ? 'right-1' : 'left-1'
            }`} />
          </button>
          <span className="text-sm text-slate-300">
            {config.enabled ? 'סיכומים מופעלים' : 'סיכומים מושבתים'}
          </span>
        </div>
      </Card>

      {/* Timing Settings */}
      {config.enabled && (
        <Card>
          <CardHeader>הגדרות זמן</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            מתי ליצור סיכום שיחה
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                זמן המתנה מההודעה האחרונה (דקות)
              </label>
              <input
                type="number"
                min={1}
                max={1440}
                value={config.delay_minutes}
                onChange={(e) => updateConfig({ delay_minutes: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
              <p className="text-xs text-slate-500 mt-1">
                סיכום יווצר {config.delay_minutes} דקות אחרי ההודעה האחרונה של הלקוח
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                מינימום הודעות לסיכום
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={config.min_messages}
                onChange={(e) => updateConfig({ min_messages: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              />
              <p className="text-xs text-slate-500 mt-1">
                רק שיחות עם לפחות {config.min_messages} הודעות יקבלו סיכום
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Webhook Settings */}
      {config.enabled && (
        <Card>
          <CardHeader>הגדרות Webhook</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            URL לשליחת סיכומי השיחות
          </p>
          
          <div className="space-y-4">
            <div>
              <Input
                label="Webhook URL"
                type="url"
                placeholder="https://example.com/webhook"
                value={config.webhook_url}
                onChange={(e) => updateConfig({ webhook_url: e.target.value })}
              />
              
              {config.webhook_url && (
                <button
                  onClick={testWebhook}
                  disabled={testingWebhook || hasChanges}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-500"
                  title={hasChanges ? 'שמור קודם לפני בדיקה' : undefined}
                >
                  {testingWebhook ? 'שולח...' : 'בדוק חיבור'}
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  מספר ניסיונות חוזרים
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={config.webhook_retry_count}
                  onChange={(e) => updateConfig({ webhook_retry_count: parseInt(e.target.value) || 3 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  השהייה בין ניסיונות (שניות)
                </label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={config.webhook_retry_delay}
                  onChange={(e) => updateConfig({ webhook_retry_delay: parseInt(e.target.value) || 60 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            
            <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
              <h4 className="text-sm font-medium text-slate-300 mb-2">מבנה ה-JSON שנשלח:</h4>
              <pre className="text-xs text-slate-400 overflow-x-auto" dir="ltr">
{`{
  "event": "conversation_summary",
  "timestamp": "2024-01-01T12:00:00Z",
  "agent_id": 1,
  "agent_name": "שם הסוכן",
  "conversation_id": 123,
  "customer_name": "שם הלקוח",
  "customer_phone": "972501234567",
  "message_count": 15,
  "summary": "תוכן הסיכום..."
}`}
              </pre>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Prompt */}
      {config.enabled && (
        <Card>
          <CardHeader>הנחיות לסיכום</CardHeader>
          <p className="text-sm text-slate-400 mb-4">
            הנחיות ל-AI ליצירת הסיכום
          </p>
          
          <Textarea
            value={config.summary_prompt}
            onChange={(e) => updateConfig({ summary_prompt: e.target.value })}
            rows={6}
            placeholder="סכם את השיחה בצורה תמציתית..."
            className="font-mono text-sm"
          />
          <p className="text-xs text-slate-500 mt-2">
            ה-AI יקבל את כל השיחה ויסכם אותה לפי ההנחיות שלך
          </p>
        </Card>
      )}

      {/* Save Button */}
      {config.enabled && hasChanges && (
        <div className="flex justify-end sticky bottom-4">
          <Button
            onClick={saveConfig}
            disabled={saving}
            loading={saving}
            variant="success"
            size="lg"
          >
            שמור שינויים
          </Button>
        </div>
      )}
    </div>
  );
}
