import { API_URL, authFetch } from './client';

export interface McpToken {
  id: number;
  name: string;
  prefix: string;
  paused: boolean;
  last_used_at: string | null;
  created_at: string | null;
}

export interface McpTokenCreated extends McpToken {
  token: string;
  mcp_url: string;
}

export interface McpConnection {
  mcp_url: string;
  user: { id: number; name: string; role: string };
}

async function parseMcpError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
  } catch {
    /* ignore */
  }
  return 'שגיאה בטוקן MCP';
}

export async function getMcpConnection(): Promise<McpConnection> {
  const res = await authFetch(`${API_URL}/api/auth/me/mcp-connection`);
  if (!res.ok) throw new Error(await parseMcpError(res));
  return res.json();
}

export async function listMcpTokens(): Promise<McpToken[]> {
  const res = await authFetch(`${API_URL}/api/auth/me/mcp-tokens`);
  if (!res.ok) throw new Error(await parseMcpError(res));
  return res.json();
}

export async function createMcpToken(name: string): Promise<McpTokenCreated> {
  const res = await authFetch(`${API_URL}/api/auth/me/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseMcpError(res));
  return res.json();
}

export async function patchMcpToken(
  tokenId: number,
  body: { name?: string; paused?: boolean },
): Promise<McpToken> {
  const res = await authFetch(`${API_URL}/api/auth/me/mcp-tokens/${tokenId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseMcpError(res));
  return res.json();
}

export async function revokeMcpToken(tokenId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/me/mcp-tokens/${tokenId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await parseMcpError(res));
}
