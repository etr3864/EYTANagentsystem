'use client';

import { useEffect, useState } from 'react';
import { getAgentChannels, type AgentChannel } from '@/lib/channels';
import { WasenderLineCard } from './WasenderLineCard';
import { WasenderRoster } from './WasenderRoster';

interface ChannelsTabProps {
  agentId: number;
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
}

export function ChannelsTab({ agentId, canCreate, canManage, canDelete }: ChannelsTabProps) {
  const [channel, setChannel] = useState<AgentChannel | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await getAgentChannels(agentId);
      setChannel(data.find((row) => row.channel_type === 'whatsapp_wasender') ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WasenderLineCard
        agentId={agentId}
        channel={channel}
        canCreate={canCreate}
        canManage={canManage}
        canDelete={canDelete}
        onChanged={load}
      />
      {channel ? <WasenderRoster agentId={agentId} channelId={channel.id} /> : null}
    </div>
  );
}
