import { API_URL, authFetch } from './api';
import type { AgentFunction, FunctionTestResult, FunctionUpsert } from './agentFunctionTypes';

const base = (agentId: number) => `${API_URL}/api/agents/${agentId}/functions`;

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail || 'שגיאה';
}

export async function listAgentFunctions(agentId: number): Promise<AgentFunction[]> {
  const res = await authFetch(base(agentId));
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createAgentFunction(agentId: number, data: FunctionUpsert): Promise<AgentFunction> {
  const res = await authFetch(base(agentId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateAgentFunction(
  agentId: number,
  id: number,
  data: FunctionUpsert,
): Promise<AgentFunction> {
  const res = await authFetch(`${base(agentId)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function patchAgentFunction(
  agentId: number,
  id: number,
  data: { enabled?: boolean; sort_order?: number },
): Promise<AgentFunction> {
  const res = await authFetch(`${base(agentId)}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function deleteAgentFunction(agentId: number, id: number): Promise<void> {
  const res = await authFetch(`${base(agentId)}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readError(res));
}

export async function testAgentFunction(
  agentId: number,
  id: number,
  live: boolean,
  sample_values: Record<string, string>,
  header_overrides: Record<string, string> = {},
): Promise<FunctionTestResult> {
  const res = await authFetch(`${base(agentId)}/${id}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ live, sample_values, header_overrides }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export interface FunctionAttention {
  id: number;
  function_id: number;
  function_name: string;
  status: string;
  stale: boolean;
  error: string | null;
  outputs: Record<string, unknown>;
  created_at: string | null;
}

export async function listFunctionAttention(agentId: number): Promise<FunctionAttention[]> {
  const res = await authFetch(`${base(agentId)}/attention`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function resolveFunctionAttention(
  agentId: number,
  rowId: number,
  action: 'done' | 'retry',
): Promise<void> {
  const res = await authFetch(`${base(agentId)}/attention/${rowId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export function prettyJsonPreservingVars(raw: string): string {
  const tokens: string[] = [];
  const replaced = raw.replace(/\{\{[^}]+\}\}/g, (match) => {
    tokens.push(match);
    return `"__VAR_${tokens.length - 1}__"`;
  });
  const parsed = JSON.parse(replaced);
  let out = JSON.stringify(parsed, null, 2);
  tokens.forEach((token, index) => {
    out = out.split(`"__VAR_${index}__"`).join(token);
    out = out.split(`__VAR_${index}__`).join(token);
  });
  return out;
}
