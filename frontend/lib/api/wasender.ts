import { API_URL, authFetch } from './client';

export interface WasenderLine {
  id: number;
  agent_id: number;
  agent_name?: string | null;
  channel_type: string;
  phone: string;
  session_name?: string | null;
  note: string | null;
  status: string;
  is_active: boolean;
  has_session: boolean;
  created_at: string | null;
  qr?: string | null;
}

export interface WasenderPatStatus {
  configured: boolean;
}

export interface AdoptResult {
  matched: number;
  skipped?: number;
  orphans: Array<{
    wasender_session_id: number;
    phone?: string;
    name?: string;
    status?: string;
  }>;
}

export interface CreateWasenderLine {
  phone: string;
  session_name?: string;
  note?: string;
  account_protection?: boolean;
  log_messages?: boolean;
  read_incoming_messages?: boolean;
  auto_reject_calls?: boolean;
  ignore_groups?: boolean;
  ignore_channels?: boolean;
  ignore_broadcasts?: boolean;
  always_online?: boolean;
}

export interface WasenderSettings extends WasenderLine {
  api_key: string;
  webhook_secret: string;
  webhook_url: string;
  webhook_events: string[];
  session_id: number | null;
  account_protection: boolean;
  log_messages: boolean;
  read_incoming_messages: boolean;
  auto_reject_calls: boolean;
  ignore_groups: boolean;
  ignore_channels: boolean;
  ignore_broadcasts: boolean;
  always_online: boolean;
}

export type WasenderSettingsUpdate = Partial<
  Pick<
    WasenderSettings,
    | 'phone'
    | 'session_name'
    | 'note'
    | 'api_key'
    | 'webhook_secret'
    | 'account_protection'
    | 'log_messages'
    | 'read_incoming_messages'
    | 'auto_reject_calls'
    | 'ignore_groups'
    | 'ignore_channels'
    | 'ignore_broadcasts'
    | 'always_online'
  >
>;

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `wasender_${res.status}`);
  }
  return res.json();
}

export async function getWasenderPat(): Promise<WasenderPatStatus> {
  return readJson(await authFetch(`${API_URL}/api/settings/wasender-pat`));
}

export async function saveWasenderPat(pat: string): Promise<WasenderPatStatus> {
  return readJson(
    await authFetch(`${API_URL}/api/settings/wasender-pat`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat }),
    }),
  );
}

export interface ProviderSession {
  wasender_session_id: number;
  phone?: string | null;
  name?: string | null;
  status: string;
  agent_id?: number | null;
  agent_name?: string | null;
  channel_id?: number | null;
}

export async function adoptWasenderSessions(): Promise<AdoptResult> {
  return readJson(
    await authFetch(`${API_URL}/api/wasender/adopt`, { method: 'POST' }),
  );
}

export async function listProviderSessions(): Promise<ProviderSession[]> {
  return readJson(await authFetch(`${API_URL}/api/wasender/provider-sessions`));
}

export async function deleteProviderSession(sessionId: number): Promise<{
  wasender_session_id: number;
  remote_ok: boolean;
}> {
  return readJson(
    await authFetch(`${API_URL}/api/wasender/provider-sessions/${sessionId}`, {
      method: 'DELETE',
    }),
  );
}

export async function createWasenderLine(agentId: number, body: CreateWasenderLine): Promise<WasenderLine> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function connectWasenderLine(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/connect`, {
      method: 'POST',
    }),
  );
}

export async function disconnectWasenderLine(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/disconnect`, {
      method: 'POST',
    }),
  );
}

export async function getWasenderLine(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}`));
}

export function wasenderLiveUrl(agentId: number, channelId: number): string {
  return `${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/live`;
}

export function publicWasenderLiveUrl(token: string): string {
  return `${API_URL}/api/wa-qr/${encodeURIComponent(token)}/live`;
}

export async function fetchWasenderQr(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/qr`));
}

export async function shareWasenderQrLink(
  agentId: number,
  channelId: number,
): Promise<{ path: string; expires_at: string }> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/share-link`, {
      method: 'POST',
    }),
  );
}

export async function getPublicWasenderQr(token: string): Promise<{
  status: string;
  connected: boolean;
  phone: string | null;
  qr: string | null;
}> {
  const res = await fetch(`${API_URL}/api/wa-qr/${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error('link_gone');
  return res.json();
}

export async function refreshPublicWasenderQr(token: string): Promise<{
  status: string;
  connected: boolean;
  phone: string | null;
  qr: string | null;
}> {
  const res = await fetch(`${API_URL}/api/wa-qr/${encodeURIComponent(token)}/refresh`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('refresh_failed');
  return res.json();
}

export async function getWasenderSettings(agentId: number, channelId: number): Promise<WasenderSettings> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/settings`));
}

export async function saveWasenderSettings(
  agentId: number,
  channelId: number,
  body: WasenderSettingsUpdate,
): Promise<WasenderSettings> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export interface WasenderContact {
  jid: string;
  name: string;
  phone?: string;
  img_url?: string;
}

export async function getWasenderGroups(agentId: number): Promise<WasenderContact[]> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/groups`));
}

export async function getWasenderContacts(agentId: number): Promise<WasenderContact[]> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/contacts`));
}

export interface WasenderCardMember {
  jid: string;
  phone: string;
  name: string;
  is_admin: boolean;
  can_open: boolean;
}

export interface WasenderCard {
  kind: 'contact' | 'group';
  jid: string;
  phone: string;
  name: string;
  notify: string;
  verified_name: string;
  status: string;
  img_url: string;
  note: string;
  participants: WasenderCardMember[];
}

export async function getWasenderCard(agentId: number, jid: string): Promise<WasenderCard> {
  const qs = new URLSearchParams({ jid });
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/card?${qs}`));
}

export async function saveWasenderCardNote(
  agentId: number,
  jid: string,
  note: string,
): Promise<{ note: string }> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/card`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, note }),
    }),
  );
}

export async function sendWasenderGroup(
  agentId: number,
  jid: string,
  text: string,
): Promise<void> {
  await readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/card/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, text }),
    }),
  );
}

export async function deleteWasenderLine(agentId: number, channelId: number): Promise<{ status: string; remote_ok: boolean }> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}`, {
      method: 'DELETE',
    }),
  );
}

