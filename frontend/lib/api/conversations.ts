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

export async function sendMessage(convId: number, text: string): Promise<{ status: string; message_id: number }> {
  const res = await authFetch(`${API_URL}/api/conversations/${convId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to send message' }));
    throw new Error(error.detail || 'Failed to send message');
  }
  return res.json();
}
