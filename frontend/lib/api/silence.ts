import { API_URL, authFetch } from './client';

export interface SilencePolicy {
  phone_silence_minutes: number | null;
  skip_saved_contacts: boolean;
  contacts_synced_at: string | null;
  blocklist_count: number;
}

export interface BlocklistPage {
  items: string[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChatSilence {
  phone_active: boolean;
  phone_forever: boolean;
  phone_until: string | null;
  in_contacts: boolean;
  contact_name: string | null;
  on_blocklist: boolean;
}

async function read<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || fallback);
  }
  return res.json();
}

export async function getSilence(agentId: number): Promise<SilencePolicy> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/silence`);
  return read(res, 'לא הצלחנו לטעון את ההגדרות');
}

export async function saveSilence(
  agentId: number,
  body: Pick<SilencePolicy, 'phone_silence_minutes' | 'skip_saved_contacts'>,
): Promise<SilencePolicy> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/silence`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(res, 'לא הצלחנו לשמור');
}

export async function refreshContacts(agentId: number): Promise<SilencePolicy> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/silence/contacts/refresh`, {
    method: 'POST',
  });
  return read(res, 'לא הצלחנו לרענן את אנשי הקשר');
}

export async function getBlocklist(agentId: number, page: number): Promise<BlocklistPage> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/blocklist?page=${page}`);
  return read(res, 'לא הצלחנו לטעון את הרשימה');
}

export async function addBlocked(agentId: number, phone: string): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/blocklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await read(res, 'מספר לא תקין');
}

export async function editBlocked(agentId: number, phone: string, newPhone: string): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/blocklist`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, new_phone: newPhone }),
  });
  await read(res, 'לא הצלחנו לעדכן');
}

export async function deleteBlocked(agentId: number, phone: string): Promise<void> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/blocklist?phone=${encodeURIComponent(phone)}`,
    { method: 'DELETE' },
  );
  await read(res, 'לא הצלחנו למחוק');
}

export async function importBlocklist(
  agentId: number,
  mode: 'replace' | 'append',
  file: File | null,
  text: string,
): Promise<number> {
  const body = new FormData();
  body.set('mode', mode);
  body.set('text', text);
  if (file) body.set('file', file);
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/blocklist/import`, {
    method: 'POST',
    body,
  });
  const data = await read<{ imported: number }>(res, 'לא הצלחנו לייבא');
  return data.imported;
}

export async function getChatSilence(agentId: number, conversationId: number): Promise<ChatSilence> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/conversations/${conversationId}/silence`,
  );
  return read(res, 'silence');
}

export async function clearPhoneSilence(agentId: number, conversationId: number): Promise<ChatSilence> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/conversations/${conversationId}/silence/phone`,
    { method: 'POST' },
  );
  return read(res, 'לא הצלחנו לבטל את השתיקה');
}

export async function clearHold(agentId: number, conversationId: number): Promise<ChatSilence> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/conversations/${conversationId}/silence/hold`,
    { method: 'POST' },
  );
  return read(res, 'לא הצלחנו להחזיר לסוכן');
}
