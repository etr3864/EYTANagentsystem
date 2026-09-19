/**
 * Channel types, capabilities, and API calls.
 *
 * channel-capabilities.json is identical to backend/core/channel_capabilities.json —
 * single source of truth maintained manually (or via build script).
 */
import capabilities from './channel-capabilities.json';

export type ChannelType = 'whatsapp_wasender' | 'whatsapp_meta' | 'instagram' | 'messenger';

export interface ChannelCapabilities {
  text: boolean;
  images: boolean;
  files: boolean;
  voice: boolean;
  reminders: boolean;
  followups: boolean;
  templates: boolean;
  has_24h_window: boolean;
  story_replies: boolean;
  mentions: boolean;
}

export const CHANNEL_CAPABILITIES = capabilities as Record<ChannelType, ChannelCapabilities>;

export const CHANNEL_DISPLAY_NAMES: Record<ChannelType, string> = {
  whatsapp_wasender: 'WhatsApp',
  whatsapp_meta: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
};

export function getCapabilities(channelType: string): ChannelCapabilities {
  return (CHANNEL_CAPABILITIES as Record<string, ChannelCapabilities>)[channelType] ?? {
    text: false, images: false, files: false, voice: false,
    reminders: false, followups: false, templates: false,
    has_24h_window: false, story_replies: false, mentions: false,
  };
}

// ── API types ─────────────────────────────────────────────────────────────────

export interface AgentChannel {
  id: number;
  agent_id: number;
  channel_type: ChannelType;
  channel_display_name: string;
  external_account_id: string;
  account_name: string | null;
  page_id: string | null;
  waba_id: string | null;
  is_active: boolean;
  health_status: 'healthy' | 'degraded' | 'error' | 'unknown' | 'deauthorized' | 'not_checked';
  last_health_check_at: string | null;
  created_at: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export async function getAgentChannels(agentId: number): Promise<AgentChannel[]> {
  const res = await fetch(`${API_URL}/api/agents/${agentId}/channels`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch channels');
  return res.json();
}

