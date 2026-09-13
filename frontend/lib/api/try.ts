import { API_URL } from './client';

export type TryBubble = {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  message_type?: string;
  media_url?: string | null;
  media_too_large?: boolean;
  reply_to?: string | null;
  created_at?: string | null;
};

export type TrySession = {
  agent_name: string;
  closed: boolean;
  closed_message: string | null;
  messages: TryBubble[];
  conversation_id: number | null;
  tester_name: string | null;
  needs_profile?: boolean;
};

function parseError(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

async function read(res: Response): Promise<TrySession> {
  const body = await res.json().catch(() => null);
  if (res.status === 410) {
    const err = new Error(parseError(body, 'הקישור פג תוקף'));
    (err as Error & { gone?: boolean }).gone = true;
    throw err;
  }
  if (!res.ok) throw new Error(parseError(body, 'שגיאה'));
  return body;
}

const creds: RequestInit = { credentials: 'include' };

export async function tryBootstrap(token: string): Promise<TrySession> {
  return read(await fetch(`${API_URL}/api/try/${encodeURIComponent(token)}`, creds));
}

export async function tryEnter(token: string, name: string, phone: string): Promise<TrySession> {
  return read(await fetch(`${API_URL}/api/try/${encodeURIComponent(token)}/enter`, {
    ...creds,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  }));
}

export async function trySend(
  token: string,
  text: string,
  replyTo: string | null,
  messageId: string,
): Promise<TrySession | { accepted: boolean; duplicate?: boolean }> {
  const res = await fetch(`${API_URL}/api/try/${encodeURIComponent(token)}/messages`, {
    ...creds,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, reply_to: replyTo, message_id: messageId }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 410) {
    const err = new Error(parseError(body, 'הקישור פג תוקף'));
    (err as Error & { gone?: boolean }).gone = true;
    throw err;
  }
  if (!res.ok) throw new Error(parseError(body, 'שליחה נכשלה'));
  return body;
}

export async function trySendMedia(
  token: string,
  file: File,
  caption: string,
  replyTo: string | null,
  messageId: string,
): Promise<TrySession | { accepted: boolean; duplicate?: boolean; message?: TryBubble }> {
  const form = new FormData();
  form.append('file', file);
  form.append('caption', caption);
  form.append('reply_to', replyTo || '');
  form.append('message_id', messageId);
  const res = await fetch(`${API_URL}/api/try/${encodeURIComponent(token)}/media`, {
    ...creds,
    method: 'POST',
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (res.status === 410) {
    const err = new Error(parseError(body, 'הקישור פג תוקף'));
    (err as Error & { gone?: boolean }).gone = true;
    throw err;
  }
  if (!res.ok) throw new Error(parseError(body, 'שליחת מדיה נכשלה'));
  return body;
}

export async function tryReset(token: string): Promise<TrySession> {
  return read(await fetch(`${API_URL}/api/try/${encodeURIComponent(token)}/reset`, {
    ...creds,
    method: 'POST',
  }));
}

export function tryEventsUrl(token: string) {
  return `${API_URL}/api/try/${encodeURIComponent(token)}/events`;
}
