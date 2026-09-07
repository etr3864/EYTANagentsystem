import { authFetch, API_URL } from './api';

export interface EscalationField {
  key: string;
  label: string;
  description: string;
  required: boolean;
}

export interface EscalationReason {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  when_to_use: string;
  payload_hint: string;
  fields: EscalationField[];
  phones: string[];
  webhook_url: string | null;
  sort_order: number;
  tool_name: string;
}

export interface EscalationPatch {
  name?: string;
  enabled?: boolean;
  when_to_use?: string;
  payload_hint?: string;
  fields?: EscalationField[];
  phones?: string[];
  webhook_url?: string | null;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    /* ignore */
  }
  return 'שגיאה באסקלציה';
}

export async function listEscalations(agentId: number): Promise<EscalationReason[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/escalations`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createEscalation(agentId: number, name: string): Promise<EscalationReason> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/escalations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function patchEscalation(
  agentId: number,
  reasonId: number,
  patch: EscalationPatch,
): Promise<EscalationReason> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/escalations/${reasonId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteEscalation(agentId: number, reasonId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/escalations/${reasonId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function generateEscalationFields(
  agentId: number,
  reasonId: number,
): Promise<EscalationReason> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/escalations/${reasonId}/generate-fields`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
