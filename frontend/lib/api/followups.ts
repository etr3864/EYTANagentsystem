import type { FollowupConfig, FollowupStats } from '../types';
import { API_URL, authFetch } from './client';

export async function getFollowupConfig(agentId: number): Promise<FollowupConfig> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/followup-config`);
  if (!res.ok) throw new Error('Failed to fetch followup config');
  return res.json();
}

export async function updateFollowupConfig(agentId: number, data: Partial<FollowupConfig>): Promise<FollowupConfig> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/followup-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update followup config');
  return res.json();
}

export async function getFollowupStats(agentId: number): Promise<FollowupStats> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/followup-stats`);
  if (!res.ok) throw new Error('Failed to fetch followup stats');
  return res.json();
}
