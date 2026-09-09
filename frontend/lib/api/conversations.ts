import type { Conversation, Message } from '../types';
import { API_URL, authFetch } from './client';

export interface ConversationCursor {
  cursor_time: string;
  cursor_id: number;
}

export interface ConversationsPage {
  items: Conversation[];
  next_cursor: ConversationCursor | null;
}

export async function getConversations(
  agentId: number,
  cursor?: ConversationCursor | null,
): Promise<ConversationsPage> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set('cursor_time', cursor.cursor_time);
    params.set('cursor_id', String(cursor.cursor_id));
  }
  const qs = params.toString();
  const url = `${API_URL}/api/agents/${agentId}/conversations${qs ? `?${qs}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function getMessages(convId: number): Promise<Message[]> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function deleteConversation(convId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete conversation');
}

export async function pauseConversation(convId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to pause conversation');
}

export async function resumeConversation(convId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resume conversation');
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const error = await res.json().catch(() => ({ detail: fallback }));
  const detail = error.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((x: { msg?: string }) => x.msg).filter(Boolean).join(', ') || fallback;
  return fallback;
}

export async function sendMessage(convId: number, text: string): Promise<{ status: string; message_id: number }> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await readApiError(res, 'שליחת ההודעה נכשלה'));
  return res.json();
}

export async function sendConversationMedia(
  convId: number,
  file: File,
  caption?: string,
  asVoice?: boolean,
): Promise<{ status: string; message_id: number }> {
  const fd = new FormData();
  fd.append('file', file);
  if (caption) fd.append('caption', caption);
  if (asVoice) fd.append('as_voice', 'true');
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/send-media`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readApiError(res, 'שליחת המדיה נכשלה'));
  return res.json();
}

export async function sendConversationTemplate(
  convId: number,
  templateId: number,
  bodyParams: string[],
  headerFile?: File,
): Promise<{ status: string; message_id: number }> {
  const fd = new FormData();
  fd.append('template_id', String(templateId));
  fd.append('body_params', JSON.stringify(bodyParams));
  if (headerFile) fd.append('header_file', headerFile);
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/send-template`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readApiError(res, 'שליחת התבנית נכשלה'));
  return res.json();
}

export interface WhatsAppInbox {
  channel_type: 'whatsapp_wasender' | 'whatsapp_meta' | null;
  templates: import('../types').WhatsAppTemplate[];
}

export function whatsappKindFromAgent(agent: {
  provider?: string | null;
  active_channel_types?: string[] | null;
}): WhatsAppInbox['channel_type'] {
  const types = agent.active_channel_types || [];
  if (types.includes('whatsapp_wasender')) return 'whatsapp_wasender';
  if (types.includes('whatsapp_meta')) return 'whatsapp_meta';
  if (agent.provider === 'wasender') return 'whatsapp_wasender';
  if (agent.provider === 'meta') return 'whatsapp_meta';
  return null;
}

export async function getWhatsAppInbox(agentId: number): Promise<WhatsAppInbox> {
  const res = await authFetch(`${API_URL}/api/conversations/inbox/whatsapp?agent_id=${agentId}`);
  if (!res.ok) throw new Error('Failed to fetch inbox settings');
  return res.json();
}

export async function startWhatsAppChat(input: {
  agentId: number;
  phone: string;
  text?: string;
  file?: File;
  caption?: string;
  asVoice?: boolean;
  templateId?: number;
  bodyParams?: string[];
  headerFile?: File;
}): Promise<{ status: string; conversation_id: number; message_id: number }> {
  const fd = new FormData();
  fd.append('agent_id', String(input.agentId));
  fd.append('phone', input.phone);
  if (input.text) fd.append('text', input.text);
  if (input.caption) fd.append('caption', input.caption);
  if (input.asVoice) fd.append('as_voice', 'true');
  if (input.file) fd.append('file', input.file);
  if (input.templateId) {
    fd.append('template_id', String(input.templateId));
    fd.append('body_params', JSON.stringify(input.bodyParams || []));
  }
  if (input.headerFile) fd.append('header_file', input.headerFile);
  const res = await authFetch(`${API_URL}/api/conversations/inbox/whatsapp`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readApiError(res, 'פתיחת הצ׳אט נכשלה'));
  return res.json();
}
