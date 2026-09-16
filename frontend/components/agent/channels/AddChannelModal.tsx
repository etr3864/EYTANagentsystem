'use client';

import { useState } from 'react';
import { getOAuthUrl, createChannel, type MetaPage, type AgentChannel } from '@/lib/channels';

interface AddChannelModalProps {
  agentId: number;
  channelType: 'instagram' | 'messenger' | 'whatsapp_meta' | 'whatsapp_wasender';
  onClose: () => void;
  onAdded: (channel: AgentChannel) => void;
}

type Step = 'choose' | 'wasender_form' | 'oauth_pending' | 'select_page' | 'done';

export function AddChannelModal({ agentId, channelType, onClose, onAdded }: AddChannelModalProps) {
  const [step, setStep] = useState<Step>(channelType === 'whatsapp_wasender' ? 'wasender_form' : 'choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WaSender form state
  const [wsApiKey, setWsApiKey] = useState('');
  const [wsSession, setWsSession] = useState('default');
  const [wsSecret, setWsSecret] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const BACKEND_URL = API_URL;
  const wasenderWebhookUrl = `${BACKEND_URL}/webhook/wasender/${agentId}`;

  async function handleOAuth() {
    setLoading(true);
    setError(null);
    try {
      const url = await getOAuthUrl(agentId, channelType);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהפניה לOAuth');
      setLoading(false);
    }
  }

  async function handleAddWaSender() {
    if (!wsApiKey.trim()) { setError('API Key נדרש'); return; }
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${API_URL}/api/agents/${agentId}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel_type: 'whatsapp_wasender',
          access_token: wsApiKey.trim(),
          external_account_id: wsSession.trim() || 'default',
          wasender_secret: wsSecret.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create WaSender channel');
      }
      const created: AgentChannel = await res.json();
      onAdded(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה ביצירת ערוץ');
    } finally {
      setLoading(false);
    }
  }

  const CHANNEL_LABELS: Record<string, string> = {
    instagram: 'Instagram',
    messenger: 'Facebook Messenger',
    whatsapp_meta: 'WhatsApp (Meta)',
    whatsapp_wasender: 'WaSender',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--bg-secondary)] border border-[var(--edge)] rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            חיבור {CHANNEL_LABELS[channelType] || channelType}
          </h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--ink)] text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* WaSender form */}
        {step === 'wasender_form' && (
          <div className="space-y-4">
            {/* Webhook URL — copy this into WaSender dashboard */}
            <div className="p-3 bg-[var(--glass-2)] border border-[var(--edge)] rounded-xl space-y-1.5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">🔗 Webhook URL להכנסה ב-WaSender</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-emerald-400 bg-[var(--bg-secondary)] px-2 py-1.5 rounded-lg font-mono truncate select-all">
                  {wasenderWebhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(wasenderWebhookUrl)}
                  className="flex-shrink-0 px-2 py-1.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs transition-colors"
                  title="העתק"
                >
                  העתק
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">הכנס כ-Webhook URL ב-WaSender Dashboard שלך</p>
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                API Key <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                className="w-full bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)]"
                value={wsApiKey}
                onChange={e => setWsApiKey(e.target.value)}
                placeholder="ey..."
                autoComplete="off"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">מ-WaSender Dashboard → Settings → API Key</p>
            </div>

            {/* Session */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Session ID</label>
              <input
                className="w-full bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)]"
                value={wsSession}
                onChange={e => setWsSession(e.target.value)}
                placeholder="default"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">שם ה-session ב-WaSender (ברירת מחדל: default)</p>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                Webhook Secret <span className="text-[var(--text-muted)]">(אופציונלי)</span>
              </label>
              <input
                type="password"
                className="w-full bg-[var(--glass-2)] border border-[var(--edge)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)]"
                value={wsSecret}
                onChange={e => setWsSecret(e.target.value)}
                placeholder="מחרוזת סודית לאימות"
                autoComplete="off"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">אם הגדרת Webhook Secret ב-WaSender — הכנס כאן</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-hover)] transition-colors">ביטול</button>
              <button
                onClick={handleAddWaSender}
                disabled={loading || !wsApiKey.trim()}
                className="flex-1 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-sm font-medium disabled:opacity-40 transition-all"
              >
                {loading ? 'מוסיף...' : 'הוסף ערוץ'}
              </button>
            </div>
          </div>
        )}

        {/* Meta OAuth */}
        {step === 'choose' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              יש להתחבר לחשבון Meta שלך כדי לחבר {CHANNEL_LABELS[channelType]}.
            </p>
            <div className="p-4 bg-[var(--glass-2)] rounded-xl border border-[var(--edge)] text-sm text-[var(--text-secondary)] space-y-2">
              <p>✓ תתחבר לחשבון Facebook/Instagram שלך</p>
              <p>✓ תבחר את הדף / חשבון העסקי הרלוונטי</p>
              <p>✓ הסוכן יתחיל לענות אוטומטית</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-sm">ביטול</button>
              <button
                onClick={handleOAuth}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-[var(--ink)] hover:opacity-90 text-[var(--bg)] text-sm font-medium transition-all"
              >
                {loading ? 'מפנה...' : 'התחבר עם Meta →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
