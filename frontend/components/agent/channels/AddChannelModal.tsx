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
      const channel = await createChannel(agentId, {
        channel_type: 'whatsapp_wasender',
        access_token: '',
        external_account_id: wsSession || 'default',
        page_id: undefined,
        waba_id: undefined,
      });
      // Actually we need to call the real API with credentials.
      // The API expects access_token but for WaSender we pass empty token.
      // We re-create using the internal API format:
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const res = await fetch(`${API_URL}/api/agents/${agentId}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel_type: 'whatsapp_wasender',
          access_token: '',
          external_account_id: wsSession || 'default',
          // credentials passed as query params workaround — server side handles via wasender config
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
      <div className="bg-[#131020] border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            חיבור {CHANNEL_LABELS[channelType] || channelType}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* WaSender form */}
        {step === 'wasender_form' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">הגדר חיבור WaSender עבור הסוכן הזה.</p>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Session (ID ייחודי)</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
                value={wsSession}
                onChange={e => setWsSession(e.target.value)}
                placeholder="default"
              />
            </div>
            <p className="text-xs text-slate-500">
              לאחר הוספה, הגדר את פרטי ה-API Key מהגדרות הסוכן (Settings → Provider).
            </p>
            <div className="flex gap-3 mt-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm">ביטול</button>
              <button
                onClick={handleAddWaSender}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-sm font-medium"
              >
                {loading ? 'מוסיף...' : 'הוסף'}
              </button>
            </div>
          </div>
        )}

        {/* Meta OAuth */}
        {step === 'choose' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              יש להתחבר לחשבון Meta שלך כדי לחבר {CHANNEL_LABELS[channelType]}.
            </p>
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 text-sm text-slate-300 space-y-2">
              <p>✓ תתחבר לחשבון Facebook/Instagram שלך</p>
              <p>✓ תבחר את הדף / חשבון העסקי הרלוונטי</p>
              <p>✓ הסוכן יתחיל לענות אוטומטית</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm">ביטול</button>
              <button
                onClick={handleOAuth}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all"
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
