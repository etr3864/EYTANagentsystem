'use client';

import { type AgentChannel, CHANNEL_DISPLAY_NAMES, getCapabilities, toggleChannel, deleteChannel } from '@/lib/channels';
import { ChannelIcon } from '@/components/ui/Icons';
import { useState } from 'react';

interface ChannelCardProps {
  channel: AgentChannel;
  canEdit: boolean;
  onChanged: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'text-emerald-400',
  degraded: 'text-yellow-400',
  error: 'text-red-400',
  unknown: 'text-[var(--text-secondary)]',
  deauthorized: 'text-red-400',
  not_checked: 'text-[var(--text-secondary)]',
};

const STATUS_LABELS: Record<string, string> = {
  healthy: 'תקין',
  degraded: 'בעיה',
  error: 'שגיאה',
  unknown: 'לא נבדק',
  deauthorized: 'בוטל',
  not_checked: 'לא נבדק',
};

export function ChannelCard({ channel, canEdit, onChanged }: ChannelCardProps) {
  const [loading, setLoading] = useState(false);
  const caps = getCapabilities(channel.channel_type);
  const displayName = CHANNEL_DISPLAY_NAMES[channel.channel_type] ?? channel.channel_type;

  async function handleToggle() {
    if (!canEdit) return;
    setLoading(true);
    try {
      await toggleChannel(channel.id, !channel.is_active);
      onChanged();
    } catch (e) {
      alert(`שגיאה: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!canEdit) return;
    if (!confirm(
      `למחוק את ערוץ ${displayName}?\n\n` +
      `⚠️ אם יש שיחות קיימות בערוץ, המחיקה תיחסם (ON DELETE RESTRICT).\n` +
      `כדי למחוק ערוץ עם שיחות — השבת אותו (toggle) במקום למחוק.`
    )) return;
    setLoading(true);
    try {
      await deleteChannel(channel.id);
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('existing conversations') || msg.includes('409')) {
        alert(
          `לא ניתן למחוק את הערוץ כי יש לו שיחות קיימות.\n\n` +
          `השבת את הערוץ (toggle) במקום למחוק — ההיסטוריה תישמר.`
        );
      } else {
        alert(`שגיאה במחיקה: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const capBadges = Object.entries(caps)
    .filter(([, v]) => v)
    .map(([k]) => CAP_LABELS[k] || k);

  return (
    <div className={`
      relative rounded-xl border p-4 transition-all
      ${channel.is_active
        ? 'bg-[var(--glass-2)] border-[var(--edge)]'
        : 'bg-[var(--glass)] border-[var(--edge)] opacity-60'
      }
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ChannelIcon channelType={channel.channel_type} size={28} />
          <div>
            <div className="font-semibold text-[var(--ink)] text-sm">{displayName}</div>
            {channel.account_name && (
              <div className="text-xs text-[var(--text-secondary)] truncate max-w-[180px]">
                {channel.account_name}
              </div>
            )}
            <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[160px]">
              {channel.external_account_id}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-xs font-medium ${STATUS_COLORS[channel.health_status] ?? 'text-[var(--text-secondary)]'}`}>
            {STATUS_LABELS[channel.health_status] ?? channel.health_status}
          </span>
          <span className={`w-2 h-2 rounded-full ${channel.is_active ? 'bg-emerald-400' : 'bg-[var(--bg-tertiary)]'}`} />
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1 mb-4">
        {capBadges.map(label => (
          <span key={label} className="text-xs bg-[var(--glass-2)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full">
            {label}
          </span>
        ))}
        {caps.has_24h_window && (
          <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
            חלון 24ש
          </span>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-2">
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`
              flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-all
              ${channel.is_active
                ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }
            `}
          >
            {loading ? '...' : channel.is_active ? 'השבת' : 'הפעל'}
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="py-1.5 px-3 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
          >
            הסר
          </button>
        </div>
      )}
    </div>
  );
}

const CAP_LABELS: Record<string, string> = {
  text: 'טקסט',
  images: 'תמונות',
  files: 'קבצים',
  voice: 'קול',
  reminders: 'תזכורות',
  followups: 'פולואפים',
  templates: 'תבניות',
  story_replies: 'Story',
  mentions: 'Mentions',
};
