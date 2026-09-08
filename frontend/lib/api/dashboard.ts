import type { AgentDetail, AgentTableRow, DashboardStats, PricingConfig, SystemSummary } from '../types';
import { API_URL, authFetch } from './client';

export async function getDashboardStats(
  fromDate: string,
  toDate: string,
  agentId?: number,
  channelType?: string,
): Promise<DashboardStats> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  if (agentId !== undefined) params.set('agent_id', String(agentId));
  if (channelType) params.set('channel_type', channelType);
  const res = await authFetch(`${API_URL}/api/dashboard?${params}`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export async function getSuperAdminSummary(fromDate: string, toDate: string): Promise<SystemSummary> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  const res = await authFetch(`${API_URL}/api/super-admin/summary?${params}`);
  if (!res.ok) throw new Error('Failed to fetch system summary');
  return res.json();
}

export async function getSuperAdminAgentsTable(fromDate: string, toDate: string): Promise<AgentTableRow[]> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  const res = await authFetch(`${API_URL}/api/super-admin/agents-table?${params}`);
  if (!res.ok) throw new Error('Failed to fetch agents table');
  return res.json();
}

export async function getSuperAdminAgentDetail(agentId: number, fromDate: string, toDate: string, channelType?: string): Promise<AgentDetail> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  if (channelType) params.set('channel_type', channelType);
  const res = await authFetch(`${API_URL}/api/super-admin/agents/${agentId}/detail?${params}`);
  if (!res.ok) throw new Error('Failed to fetch agent detail');
  return res.json();
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const res = await authFetch(`${API_URL}/api/super-admin/pricing`);
  if (!res.ok) throw new Error('Failed to fetch pricing config');
  return res.json();
}

export async function updatePricingConfig(updates: Record<string, number>): Promise<PricingConfig> {
  const res = await authFetch(`${API_URL}/api/super-admin/pricing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update pricing config');
  return res.json();
}

export async function exportConversations(
  agentId: number,
  fromDate: string,
  toDate: string,
): Promise<void> {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
  const res = await authFetch(`${API_URL}/api/super-admin/agents/${agentId}/export?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  a.download = match?.[1] ?? `conversations_${agentId}_${fromDate}_to_${toDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
