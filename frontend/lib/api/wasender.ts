import { API_URL, authFetch } from './client';

export interface WasenderLine {
  id: number;
  agent_id: number;
  channel_type: string;
  phone: string;
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
  orphans: Array<{
    wasender_session_id: number;
    phone?: string;
    name?: string;
    status?: string;
  }>;
}

export interface CreateWasenderLine {
  phone: string;
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

export async function adoptWasenderSessions(): Promise<AdoptResult> {
  return readJson(
    await authFetch(`${API_URL}/api/wasender/adopt`, { method: 'POST' }),
  );
}

export async function listWasenderHub(): Promise<WasenderLine[]> {
  return readJson(await authFetch(`${API_URL}/api/wasender/sessions`));
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

export async function refreshWasenderLine(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/refresh`, {
      method: 'POST',
    }),
  );
}

export async function fetchWasenderQr(agentId: number, channelId: number): Promise<WasenderLine> {
  return readJson(await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}/qr`));
}

export async function deleteWasenderLine(agentId: number, channelId: number): Promise<{ status: string; remote_ok: boolean }> {
  return readJson(
    await authFetch(`${API_URL}/api/agents/${agentId}/wasender/sessions/${channelId}`, {
      method: 'DELETE',
    }),
  );
}

