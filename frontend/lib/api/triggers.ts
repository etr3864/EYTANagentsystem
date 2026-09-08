import { API_URL, authFetch } from './client';

export async function getExternalApiKey(): Promise<string> {
  const res = await authFetch(`${API_URL}/api/external/api-key`);
  if (!res.ok) throw new Error('Failed to fetch API key');
  const data = await res.json();
  return data.api_key;
}

export type TriggerKind = 'push' | 'send';

export interface AgentTrigger {
  id: number;
  agent_id: number;
  name: string;
  kind: TriggerKind;
  token: string;
  enabled: boolean;
  created_at: string | null;
}

async function parseTriggerError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    /* ignore */
  }
  return 'שגיאה בטריגר';
}

export async function listAgentTriggers(agentId: number): Promise<AgentTrigger[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/triggers`);
  if (!res.ok) throw new Error(await parseTriggerError(res));
  return res.json();
}

export async function createAgentTrigger(
  agentId: number,
  name: string,
  kind: TriggerKind,
): Promise<AgentTrigger> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind }),
  });
  if (!res.ok) throw new Error(await parseTriggerError(res));
  return res.json();
}

export async function patchAgentTrigger(
  agentId: number,
  triggerId: number,
  patch: { enabled?: boolean; name?: string },
): Promise<AgentTrigger> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/triggers/${triggerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseTriggerError(res));
  return res.json();
}

export async function deleteAgentTrigger(agentId: number, triggerId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/triggers/${triggerId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseTriggerError(res));
}
