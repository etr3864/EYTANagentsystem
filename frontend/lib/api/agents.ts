import type { Agent, AgentCreate, AgentUpdate, MetaInfo, User } from '../types';
import { API_URL, authFetch } from './client';

export async function getAgents(): Promise<Agent[]> {
  const res = await authFetch(`${API_URL}/api/agents`);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function getAgent(id: number): Promise<Agent> {
  const res = await authFetch(`${API_URL}/api/agents/${id}`);
  if (!res.ok) throw new Error('Failed to fetch agent');
  return res.json();
}

export async function createAgent(data: AgentCreate): Promise<{ id: number; meta_info?: MetaInfo }> {
  const res = await authFetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || 'שגיאה ביצירת הסוכן');
  }
  return res.json();
}

export async function updateAgent(id: number, data: AgentUpdate): Promise<{ id: number; meta_info?: MetaInfo }> {
  const res = await authFetch(`${API_URL}/api/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || 'שגיאה בעדכון הסוכן');
  }
  return res.json();
}

export async function deleteAgent(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete agent');
}

// ============ Users ============
export async function getUsers(): Promise<User[]> {
  const res = await authFetch(`${API_URL}/api/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function deleteUser(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete user');
}
