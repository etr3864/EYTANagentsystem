import { API_URL, authFetch } from './api';
import type { AgentFunction, AgentFunctionParam, FunctionTestResult, FunctionUpsert } from './agentFunctionTypes';

const base = (agentId: number) => `${API_URL}/api/agents/${agentId}/functions`;

const FIELD_HE: Record<string, string> = {
  name: 'שם הפונקציה',
  when_to_use: 'מתי להשתמש',
  when_not_to_use: 'מתי לא להשתמש',
  response_instructions: 'איך להציג ללקוח',
  url: 'כתובת HTTPS',
  method: 'שיטת HTTP',
  headers: 'Headers',
  body_template: 'גוף הבקשה',
  params: 'פרמטר',
  outputs: 'שמירת תשובה',
  max_response_chars: 'מקסימום תווים לסוכן',
  json_path: 'שדה ב-JSON',
  save_as: 'לשמור בשם',
  source: 'מאיפה הערך',
  source_key: 'שם הערך השמור',
  description: 'תיאור לבוט',
  event_type: 'סוג אירוע',
  trigger: 'מתי זה רץ',
  side_effect: 'סוג פעולה',
};

function fieldFromLoc(loc: unknown): string {
  if (!Array.isArray(loc)) return '';
  const labels: string[] = [];
  for (const part of loc) {
    if (part === 'body' || part === 'query' || part === 'path') continue;
    if (typeof part === 'number') {
      const last = labels.length - 1;
      if (last >= 0) labels[last] = `${labels[last]} ${part + 1}`;
      else labels.push(String(part + 1));
      continue;
    }
    const key = String(part);
    if (key === 'name' && labels.length > 0) {
      labels.push('שם');
      continue;
    }
    labels.push(FIELD_HE[key] || key);
  }
  return labels.join(' → ');
}

function translateIssue(item: {
  type?: string;
  msg?: string;
  ctx?: { min_length?: number; max_length?: number };
}): string {
  const type = item.type || '';
  const msg = (item.msg || '').replace(/^Value error,?\s*/i, '');
  if (type === 'string_too_short' || type === 'too_short') {
    const n = item.ctx?.min_length;
    return n ? `לפחות ${n} תווים` : 'קצר מדי';
  }
  if (type === 'string_too_long' || type === 'too_long') {
    return 'ארוך מדי';
  }
  if (type === 'missing') return 'חובה';
  return msg || 'לא תקין';
}

function formatDetail(detail: unknown): string {
  if (!detail) return 'שגיאה בשמירה';
  if (typeof detail === 'string') return detail;
  const items = Array.isArray(detail) ? detail : [detail];
  const lines = items.map((item) => {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const rec = item as {
      loc?: unknown;
      msg?: string;
      type?: string;
      ctx?: { min_length?: number; max_length?: number };
    };
    if (!rec.msg && !rec.type && !rec.loc) return null;
    const field = fieldFromLoc(rec.loc);
    const text = translateIssue(rec);
    return field ? `${field}: ${text}` : text;
  }).filter((line): line is string => Boolean(line));
  return lines.join('\n') || 'שגיאה בשמירה';
}

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return formatDetail(body?.detail);
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

const TEMPLATE_VAR_RE = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;

export function extractTemplateVars(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TEMPLATE_VAR_RE)) {
      seen.add(match[1]);
    }
  }
  return [...seen];
}

function isParamStub(param: AgentFunctionParam): boolean {
  return (
    param.source === 'ask'
    && !param.description
    && !param.source_key
    && param.required !== false
    && (param.type || 'string') === 'string'
  );
}

export function mergeParamsFromVars(
  params: AgentFunctionParam[],
  vars: string[],
): AgentFunctionParam[] {
  const varSet = new Set(vars);
  const kept = params.filter((param) => {
    if (!param.name) return true;
    if (varSet.has(param.name)) return true;
    return !isParamStub(param);
  });
  const have = new Set(kept.map((param) => param.name).filter(Boolean));
  const added: AgentFunctionParam[] = vars
    .filter((name) => !have.has(name))
    .map((name) => ({
      name,
      type: 'string',
      required: true,
      description: '',
      source: 'ask',
    }));
  return [...kept, ...added];
}

export function sampleValuesFromParams(params: AgentFunctionParam[]): string {
  const entries = (params || [])
    .filter((param) => param.name)
    .map((param) => [param.name, ''] as const);
  if (entries.length === 0) return '{}';
  return JSON.stringify(Object.fromEntries(entries), null, 2);
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
