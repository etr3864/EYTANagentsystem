'use client';

/**
 * WhatsApp channel card with WaSender ↔ WA Meta mutex toggle.
 *
 * Rules:
 * - A WaSender channel and a WA Meta channel cannot both be active.
 * - If one is active, the other shows a disabled "conflict" state.
 * - Switching requires explicitly disabling the active one first.
 */
import { type AgentChannel, CHANNEL_DISPLAY_NAMES, toggleChannel } from '@/lib/channels';
import { useState } from 'react';

interface WhatsAppChannelCardProps {
  wasenderChannel: AgentChannel | null;
  metaChannel: AgentChannel | null;
  canEdit: boolean;
  onChanged: () => void;
  onAddWaSender: () => void;
  onAddMeta: () => void;
}

export function WhatsAppChannelCard({
  wasenderChannel,
  metaChannel,
  canEdit,
  onChanged,
  onAddWaSender,
  onAddMeta,
}: WhatsAppChannelCardProps) {
  const [loading, setLoading] = useState(false);

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
              {canEdit && (
                <button
                  onClick={() => handleToggle(wasenderChannel, !wasenderChannel.is_active)}
                  disabled={loading || (!wasenderChannel.is_active && !!metaChannel?.is_active)}
                  className={`w-full py-1 px-2 rounded text-xs font-medium transition-all
                    ${wasenderChannel.is_active
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                >
                  {wasenderChannel.is_active ? 'השבת' : 'הפעל'}
                </button>
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
