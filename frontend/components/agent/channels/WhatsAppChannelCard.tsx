'use client';

/**
 * WhatsApp channel card with WaSender ↔ WA Meta mutex toggle.
 *
 * Rules:
 * - A WaSender channel and a WA Meta channel cannot both be active.
 * - If one is active, the other shows a disabled "conflict" state.
 * - Switching requires explicitly disabling the active one first.
 */
import { type AgentChannel, CHANNEL_DISPLAY_NAMES, toggleChannel, updateWaSenderCredentials } from '@/lib/channels';
import { useState } from 'react';

interface WhatsAppChannelCardProps {
  agentId: number;
  wasenderChannel: AgentChannel | null;
  metaChannel: AgentChannel | null;
  canEdit: boolean;
  onChanged: () => void;
  onAddWaSender: () => void;
  onAddMeta: () => void;
}

export function WhatsAppChannelCard({
  agentId,
  wasenderChannel,
  metaChannel,
  canEdit,
  onChanged,
  onAddWaSender,
  onAddMeta,
}: WhatsAppChannelCardProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editApiKey, setEditApiKey] = useState('');
  const [editSession, setEditSession] = useState('');
  const [editSecret, setEditSecret] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const wasenderWebhookUrl = `${API_URL}/webhook/wasender/${agentId}`;

  function startEdit() {
    setEditApiKey('');
    setEditSession(wasenderChannel?.external_account_id || 'default');
    setEditSecret('');
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!wasenderChannel) return;
    setSaving(true);
    setEditError(null);
    try {
      const payload: Record<string, string> = {};
      if (editApiKey.trim()) payload.api_key = editApiKey.trim();
      if (editSession.trim() && editSession.trim() !== wasenderChannel.external_account_id) {
        payload.session = editSession.trim();
        payload.external_account_id = editSession.trim();
      }
      if (editSecret.trim()) payload.webhook_secret = editSecret.trim();
      if (Object.keys(payload).length === 0) { setEditing(false); return; }
      await updateWaSenderCredentials(wasenderChannel.id, payload);
      setEditing(false);
      onChanged();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  const activeWa = wasenderChannel?.is_active ? 'wasender' : metaChannel?.is_active ? 'meta' : null;

  async function handleToggle(channel: AgentChannel, activate: boolean) {
    if (!canEdit) return;
    // Mutual exclusion: cannot activate if the other WA type is already active
    if (activate) {
      const other = channel.channel_type === 'whatsapp_wasender' ? metaChannel : wasenderChannel;
      if (other?.is_active) {
        alert(`לא ניתן להפעיל ${CHANNEL_DISPLAY_NAMES[channel.channel_type]} בזמן ש-${CHANNEL_DISPLAY_NAMES[other.channel_type]} פעיל.\nהשבת אותו תחילה.`);
        return;
      }
    }
    setLoading(true);
    try {
      await toggleChannel(channel.id, activate);
      onChanged();
    } catch (e) {
      alert(`שגיאה: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">📱</span>
        <h3 className="font-semibold text-white text-sm">WhatsApp</h3>
        {activeWa && (
          <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {activeWa === 'wasender' ? 'WaSender פעיל' : 'Meta פעיל'}
          </span>
        )}
      </div>

      {/* Conflict notice */}
      {activeWa && (
        <div className="mb-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          רק ספק WhatsApp אחד יכול להיות פעיל בו-זמנית. השבת את הפעיל לפני החלפה.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* WaSender */}
        <div className={`rounded-lg border p-3 ${wasenderChannel?.is_active ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 bg-slate-900/40'}`}>
          <div className="text-xs font-medium text-white mb-1">WaSender</div>
          {wasenderChannel ? (
            <>
              <div className="text-xs text-slate-500 truncate mb-2">{wasenderChannel.external_account_id}</div>
              {wasenderChannel.is_active && (
                <div className="mb-2 p-2 bg-slate-900/60 border border-slate-700/50 rounded-lg">
                  <div className="text-[10px] text-slate-400 mb-1">🔗 Webhook URL</div>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 text-[10px] text-emerald-400 font-mono truncate select-all">{wasenderWebhookUrl}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(wasenderWebhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex-shrink-0 px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-300 transition-colors"
                    >
                      {copied ? '✓' : 'העתק'}
                    </button>
                  </div>
                </div>
              )}

              {/* Edit form */}
              {editing && (
                <div className="mb-2 p-2 bg-slate-900/60 border border-slate-700/50 rounded-lg space-y-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">API Key (השאר ריק = ללא שינוי)</label>
                    <input type="password" value={editApiKey} onChange={e => setEditApiKey(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="ey..." autoComplete="off" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Session</label>
                    <input value={editSession} onChange={e => setEditSession(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="default" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Webhook Secret (השאר ריק = ללא שינוי)</label>
                    <input type="password" value={editSecret} onChange={e => setEditSecret(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="סודי" autoComplete="off" />
                  </div>
                  {editError && <p className="text-[10px] text-red-400">{editError}</p>}
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditing(false)} disabled={saving}
                      className="flex-1 py-1 rounded text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">ביטול</button>
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 py-1 rounded text-[10px] bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50">
                      {saving ? '...' : 'שמור'}</button>
                  </div>
                </div>
              )}

              {canEdit && (
                <div className="flex gap-1.5">
                  {!editing && (
                    <button
                      onClick={startEdit}
                      className="flex-1 py-1 px-2 rounded text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-400 transition-all"
                    >
                      ✏️ ערוך
                    </button>
                  )}
                  <button
                    onClick={() => handleToggle(wasenderChannel, !wasenderChannel.is_active)}
                    disabled={loading || (!wasenderChannel.is_active && !!metaChannel?.is_active)}
                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-all
                      ${wasenderChannel.is_active
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                  >
                    {wasenderChannel.is_active ? 'השבת' : 'הפעל'}
                  </button>
                </div>
              )}
            </>
          ) : (
            canEdit && (
              <button
                onClick={onAddWaSender}
                disabled={!!metaChannel?.is_active}
                className="w-full py-1 px-2 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + חבר
              </button>
            )
          )}
        </div>

        {/* WhatsApp Meta */}
        <div className={`rounded-lg border p-3 ${metaChannel?.is_active ? 'border-blue-500/40 bg-blue-500/5' : 'border-slate-700 bg-slate-900/40'}`}>
          <div className="text-xs font-medium text-white mb-1">Meta (רשמי)</div>
          {metaChannel ? (
            <>
              <div className="text-xs text-slate-500 truncate mb-2">{metaChannel.external_account_id}</div>
              {canEdit && (
                <button
                  onClick={() => handleToggle(metaChannel, !metaChannel.is_active)}
                  disabled={loading || (!metaChannel.is_active && !!wasenderChannel?.is_active)}
                  className={`w-full py-1 px-2 rounded text-xs font-medium transition-all
                    ${metaChannel.is_active
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                >
                  {metaChannel.is_active ? 'השבת' : 'הפעל'}
                </button>
              )}
            </>
          ) : (
            canEdit && (
              <button
                onClick={onAddMeta}
                disabled={!!wasenderChannel?.is_active}
                className="w-full py-1 px-2 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + חבר
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
