'use client';

import { useEffect, useState } from 'react';
import { getAgentChannels, type AgentChannel, type ChannelType } from '@/lib/channels';
import { getAgent, updateAgent } from '@/lib/api';
import { ChannelCard } from './ChannelCard';
import { WhatsAppChannelCard } from './WhatsAppChannelCard';
import { AddChannelModal } from './AddChannelModal';

interface ChannelsTabProps {
  agentId: number;
  canEdit: boolean; // true = super_admin
}

export function ChannelsTab({ agentId, canEdit }: ChannelsTabProps) {
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingChannelType, setAddingChannelType] = useState<ChannelType | null>(null);
  const [businessAssistantMode, setBusinessAssistantMode] = useState(false);
  const [savingMode, setSavingMode] = useState(false);

  async function loadChannels() {
    try {
      const [data, agentData] = await Promise.all([
        getAgentChannels(agentId),
        getAgent(agentId),
      ]);
      setChannels(data);
      setBusinessAssistantMode(agentData.business_assistant_mode ?? false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleBusinessMode(val: boolean) {
    setSavingMode(true);
    try {
      await updateAgent(agentId, { business_assistant_mode: val });
      setBusinessAssistantMode(val);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMode(false);
    }
  }

  useEffect(() => {
    loadChannels();
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const wasenderChannel = channels.find(c => c.channel_type === 'whatsapp_wasender') ?? null;
  const metaChannel = channels.find(c => c.channel_type === 'whatsapp_meta') ?? null;
  const igChannel = channels.find(c => c.channel_type === 'instagram') ?? null;
  const msChannel = channels.find(c => c.channel_type === 'messenger') ?? null;

  const nonWaChannels = channels.filter(
    c => c.channel_type !== 'whatsapp_wasender' && c.channel_type !== 'whatsapp_meta'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">ערוצי תקשורת</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            נהל את הערוצים שדרכם הסוכן מגיב להודעות
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {!igChannel && (
              <button
                onClick={() => setAddingChannelType('instagram')}
                className="px-3 py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 text-sm transition-all"
              >
                + Instagram
              </button>
            )}
            {!msChannel && (
              <button
                onClick={() => setAddingChannelType('messenger')}
                className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-sm transition-all"
              >
                + Messenger
              </button>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp card (with mutex UI) */}
      <div>
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">WhatsApp</h3>
        <WhatsAppChannelCard
          wasenderChannel={wasenderChannel}
          metaChannel={metaChannel}
          canEdit={canEdit}
          onChanged={loadChannels}
          onAddWaSender={() => setAddingChannelType('whatsapp_wasender')}
          onAddMeta={() => setAddingChannelType('whatsapp_meta')}
        />
      </div>

      {/* Other channels */}
      {nonWaChannels.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">ערוצים נוספים</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nonWaChannels.map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                canEdit={canEdit}
                onChanged={loadChannels}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty non-WA state */}
      {nonWaChannels.length === 0 && canEdit && (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <div className="text-3xl mb-2">📡</div>
          <p className="text-slate-400 text-sm mb-4">אין ערוצים נוספים. חבר Instagram או Messenger להרחבת הסוכן.</p>
          <div className="flex justify-center gap-3">
            {!igChannel && (
              <button
                onClick={() => setAddingChannelType('instagram')}
                className="px-4 py-2 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 text-sm transition-all"
              >
                📸 Instagram
              </button>
            )}
            {!msChannel && (
              <button
                onClick={() => setAddingChannelType('messenger')}
                className="px-4 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-sm transition-all"
              >
                💬 Messenger
              </button>
            )}
          </div>
        </div>
      )}

      {/* Business Assistant Mode (Meta compliance) */}
      {canEdit && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-amber-300 flex items-center gap-2">
                <span>🛡️</span>
                Business Assistant Mode
              </div>
              <p className="text-xs text-slate-400 mt-1">
                מצב תאימות Meta 2026 — מוסיף disclaimer אוטומטי שהסוכן הוא AI. חובה לפני הגשת App Review.
              </p>
            </div>
            <button
              onClick={() => handleToggleBusinessMode(!businessAssistantMode)}
              disabled={savingMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                businessAssistantMode ? 'bg-amber-500' : 'bg-slate-700'
              } ${savingMode ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Toggle Business Assistant Mode"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  businessAssistantMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Add channel modal */}
      {addingChannelType && (
        <AddChannelModal
          agentId={agentId}
          channelType={addingChannelType}
          onClose={() => setAddingChannelType(null)}
          onAdded={(ch) => {
            setChannels(prev => [...prev.filter(c => c.id !== ch.id), ch]);
            setAddingChannelType(null);
          }}
        />
      )}
    </div>
  );
}
