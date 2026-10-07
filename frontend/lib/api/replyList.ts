import { API_URL, authFetch } from './client';

export interface ReplyPerson {
  phone: string;
  name: string;
  note: string;
}

export interface ReplyListPage {
  enabled: boolean;
  items: ReplyPerson[];
  total: number;
  page: number;
  page_size: number;
}

async function read<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : fallback);
  }
  return res.json();
}

export async function getReplyList(agentId: number, page = 1): Promise<ReplyListPage> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/reply-list?page=${page}`);
  return read(res, 'לא הצלחנו לטעון את הרשימה');
}

export async function setReplyListEnabled(agentId: number, enabled: boolean): Promise<boolean> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/reply-list`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const data = await read<{ enabled: boolean }>(res, 'לא הצלחנו לשמור');
  return data.enabled;
}

export async function addReplyPerson(
  agentId: number,
  phone: string,
  name: string,
  note: string,
): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/reply-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name, note }),
  });
  await read(res, 'לא הצלחנו להוסיף');
}

export async function editReplyPerson(
  agentId: number,
  phone: string,
  name: string,
  note: string,
  newPhone: string,
): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/reply-list`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name, note, new_phone: newPhone }),
  });
  await read(res, 'לא הצלחנו לשמור');
}

export async function removeReplyPeople(
  agentId: number,
  phones: string[],
  all = false,
): Promise<boolean> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/reply-list/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phones, all }),
  });
  const data = await read<{ enabled: boolean }>(res, 'לא הצלחנו למחוק');
  return data.enabled;
}
