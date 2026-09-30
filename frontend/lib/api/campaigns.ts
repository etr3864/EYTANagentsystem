import { API_URL, authFetch } from './client';

export interface CampaignRow {
  id: number;
  agent_id: number;
  agent_name: string;
  name: string;
  status: string;
  pause_reason: string | null;
  session: string;
  send_percent: number;
  reply_percent: number;
  recipient_count: number;
  current_step: number;
  step_sent_count: number;
  updated_at: string | null;
  hourly_cap: number | null;
  gap_min_seconds: number;
  gap_max_seconds: number;
  last_sent_at: string | null;
  description?: string | null;
  mode?: string;
  template_body?: string | null;
  prompt?: string | null;
  column_defaults?: Record<string, string>;
  rephrase_enabled?: boolean;
  writer_model?: string;
  rephrase_model?: string;
  window_start?: string | null;
  window_end?: string | null;
  timezone?: string;
  skip_recent_amount?: number | null;
  skip_recent_unit?: string | null;
  delivered_count?: number;
  cost_ils?: number;
  tokens?: number;
  media_kind?: string | null;
  media_name?: string | null;
  media_description?: string | null;
  steps?: { position: number; delay_minutes: number; template_body?: string | null; prompt?: string | null }[];
}

export interface RecipientRow {
  phone: string;
  name: string;
  status: string;
  reason: string | null;
  sent_at: string | null;
  body: string | null;
  media_url: string | null;
  media_kind: string | null;
  media_name: string | null;
  chat: boolean;
}

async function read<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : fallback);
  }
  return res.json();
}

export async function listCampaigns(params: { agentId?: number; status?: string; q?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.agentId) query.set('agent_id', String(params.agentId));
  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  const res = await authFetch(`${API_URL}/api/campaigns?${query}`);
  return read<{ items: CampaignRow[]; total: number; page: number }>(res, 'לא הצלחנו לטעון קמפיינים');
}

export async function createCampaign(agentId: number, name: string) {
  const res = await authFetch(`${API_URL}/api/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_id: agentId, name }),
  });
  return read<CampaignRow>(res, 'לא הצלחנו ליצור');
}

export async function getCampaign(id: number) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}`);
  return read<CampaignRow>(res, 'לא נמצא');
}

export async function patchCampaign(id: number, body: Record<string, unknown>) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read<CampaignRow>(res, 'לא הצלחנו לשמור');
}

export async function deleteCampaign(id: number) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}`, { method: 'DELETE' });
  return read<{ status: string }>(res, 'לא הצלחנו למחוק');
}

export async function campaignAction(
  id: number,
  action: 'pause' | 'resume' | 'start' | 'retry' | 'finish',
  startsAt?: string,
) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(startsAt ? { starts_at: startsAt } : {}),
  });
  return read<{ status?: string; retried?: number }>(res, 'הפעולה נכשלה');
}

export async function listRecipients(id: number, page = 1, q = '', status = '') {
  const query = new URLSearchParams({ page: String(page) });
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/recipients?${query}`);
  return read<{ items: RecipientRow[]; total: number; page: number; counts: Record<string, number> }>(res, 'נמענים');
}

export async function retryChosen(id: number, phones: string[]) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/retry-chosen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phones }),
  });
  return read<{ retried: number }>(res, 'השליחה החוזרת');
}

export async function openCampaignChat(id: number, phone: string) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/open-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return read<{ conversation_id: number; agent_id: number; phone: string }>(res, 'השיחה');
}

export function campaignLiveUrl(id: number) {
  return `${API_URL}/api/campaigns/${id}/live`;
}

export async function setCampaignCaps(agentId: number, hourlyCap: number, dailyCap: number) {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/campaign-caps`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hourly_cap: hourlyCap, daily_cap: dailyCap }),
  });
  return read<{ hourly_cap: number; daily_cap: number }>(res, 'התקרה');
}

export async function setCampaignFlag(agentId: number, enabled: boolean, resume = false) {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/campaigns`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, resume }),
  });
  return read<{ enabled: boolean; paused: { id: number; name: string }[]; resumed: number[] }>(res, 'הדגל');
}

export async function uploadAudience(id: number, file: File) {
  const body = new FormData();
  body.set('file', file);
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/audience`, { method: 'POST', body });
  return read<{ import_id: number; headers: string[]; sample: Record<string, string>[] }>(res, 'הקובץ');
}

export async function commitAudience(id: number, importId: number, phoneColumn: string) {
  const body = new FormData();
  body.set('phone_column', phoneColumn);
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/audience/${importId}`, { method: 'POST', body });
  return read<{ status: string }>(res, 'הטעינה');
}

export async function audienceStatus(id: number, importId: number) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/audience/${importId}`);
  return read<{ status: string; error: string | null; duplicates: number }>(res, 'סטטוס ייבוא');
}

export async function dropDuplicates(id: number) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/duplicates/drop`, { method: 'POST' });
  return read<{ removed: number }>(res, 'כפילויות');
}

export async function previewCampaign(id: number) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/preview`, { method: 'POST' });
  return read<{ text: string; phone?: string }>(res, 'תצוגה');
}

export async function testSend(id: number, phone: string) {
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/test-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  return read<{ status: string }>(res, 'שליחת הבדיקה');
}

export async function uploadCampaignMedia(id: number, file: File, description: string) {
  const body = new FormData();
  body.set('file', file);
  body.set('description', description);
  const res = await authFetch(`${API_URL}/api/campaigns/${id}/media`, { method: 'POST', body });
  return read<{ kind: string; name: string; description: string }>(res, 'מדיה');
}
