import { API_URL, authFetch } from './client';

export type PlaygroundLinkRow = {
  id: number;
  status: string;
  ttl_seconds: number;
  expires_at: string | null;
  stopped_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
  agent_name: string;
  conversation_count: number;
  tester_count: number;
  tokens_used: number;
  token_limit: number;
  url: string | null;
};

async function parse(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail || 'שגיאה');
  return body;
}

export async function listPlaygroundLinks(agentId: number): Promise<PlaygroundLinkRow[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links`);
  return parse(res);
}

export async function createPlaygroundLink(
  agentId: number,
  ttlSeconds: number,
): Promise<PlaygroundLinkRow> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  });
  return parse(res);
}

export async function stopPlaygroundLink(agentId: number, linkId: number): Promise<PlaygroundLinkRow> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links/${linkId}/stop`, {
    method: 'POST',
  });
  return parse(res);
}

export async function restorePlaygroundLink(agentId: number, linkId: number): Promise<PlaygroundLinkRow> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links/${linkId}/restore`, {
    method: 'POST',
  });
  return parse(res);
}

export async function deletePlaygroundLink(agentId: number, linkId: number): Promise<PlaygroundLinkRow> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links/${linkId}`, {
    method: 'DELETE',
  });
  return parse(res);
}

export type PlaygroundTester = {
  id: number;
  label: string;
  name: string;
  phone: string;
  conversation_count: number;
  last_activity: string | null;
};

export type PlaygroundAdminMessage = {
  id: number;
  role: string;
  content: string;
  message_type: string;
  media_url: string | null;
  reply_to: string | null;
  created_at: string | null;
};

export type PlaygroundAdminConversation = {
  id: number;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  messages: PlaygroundAdminMessage[];
};

export type PlaygroundTesterDetail = {
  tester: PlaygroundTester;
  conversations: PlaygroundAdminConversation[];
};

export async function listPlaygroundTesters(
  agentId: number,
  linkId: number,
): Promise<PlaygroundTester[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/playground-links/${linkId}/testers`);
  return parse(res);
}

export async function getPlaygroundTester(
  agentId: number,
  linkId: number,
  userId: number,
): Promise<PlaygroundTesterDetail> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/playground-links/${linkId}/testers/${userId}`,
  );
  return parse(res);
}

async function downloadAttachment(res: Response, fallback: string) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || 'ייצוא נכשל');
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  const name = match?.[1] || fallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPlaygroundExport(
  agentId: number,
  linkId: number,
  convId: number,
): Promise<void> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/playground-links/${linkId}/conversations/${convId}/export`,
  );
  await downloadAttachment(res, 'playground.json');
}

export async function downloadPlaygroundTesterExport(
  agentId: number,
  linkId: number,
  userId: number,
): Promise<void> {
  const res = await authFetch(
    `${API_URL}/api/agents/${agentId}/playground-links/${linkId}/testers/${userId}/export`,
  );
  await downloadAttachment(res, 'playground-all.json');
}
