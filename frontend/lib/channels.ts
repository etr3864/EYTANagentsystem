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
  whatsapp_wasender: 'WhatsApp (WaSender)',
  whatsapp_meta: 'WhatsApp (Meta)',
  instagram: 'Instagram',
  messenger: 'Messenger',
};

export const CHANNEL_ICONS: Record<ChannelType, string> = {
  whatsapp_wasender: '📱',
  whatsapp_meta: '💬',
  instagram: '📸',
  messenger: '💬',
};

export const CHANNEL_COLORS: Record<ChannelType, string> = {
  whatsapp_wasender: 'emerald',
  whatsapp_meta: 'blue',
  instagram: 'pink',
  messenger: 'indigo',
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
  page_id: string | null;
  waba_id: string | null;
  is_active: boolean;
  health_status: 'healthy' | 'degraded' | 'error' | 'unknown' | 'deauthorized' | 'not_checked';
  last_health_check_at: string | null;
  created_at: string;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; name: string; username: string } | null;
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

export async function getOAuthUrl(agentId: number, channelType: string): Promise<string> {
  const res = await fetch(
    `${API_URL}/api/agents/${agentId}/channels/oauth-url?channel_type=${channelType}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error('Failed to get OAuth URL');
  const data = await res.json();
  return data.url;
}

export async function createChannel(
  agentId: number,
  payload: {
    channel_type: string;
    access_token: string;
    external_account_id: string;
    page_id?: string;
    waba_id?: string;
  },
): Promise<AgentChannel> {
  const res = await fetch(`${API_URL}/api/agents/${agentId}/channels`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create channel');
  }
  return res.json();
}

export async function toggleChannel(channelId: number, isActive: boolean): Promise<AgentChannel> {
  const res = await fetch(`${API_URL}/api/channels/${channelId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res.ok) throw new Error('Failed to toggle channel');
  return res.json();
}

export async function deleteChannel(channelId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/channels/${channelId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete channel');
}

export async function updateWaSenderCredentials(
  channelId: number,
  payload: { api_key?: string; session?: string; webhook_secret?: string; external_account_id?: string },
): Promise<AgentChannel> {
  const res = await fetch(`${API_URL}/api/channels/${channelId}/credentials`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update credentials');
  }
  return res.json();
}
