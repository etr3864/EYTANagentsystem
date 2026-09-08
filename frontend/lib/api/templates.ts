import type { WhatsAppTemplate } from '../types';
import { API_URL, authFetch } from './client';

export async function getTemplates(agentId: number): Promise<WhatsAppTemplate[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function syncTemplates(agentId: number): Promise<{ synced: number }> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates/sync`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sync templates');
  return res.json();
}

export async function uploadTemplateMedia(agentId: number, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates/upload-media`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to upload media');
  }
  const data = await res.json();
  return data.handle;
}

export async function createTemplate(agentId: number, data: { name: string; language: string; category: string; components: Record<string, unknown>[]; header_handle?: string }): Promise<WhatsAppTemplate> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create template');
  }
  return res.json();
}

export async function updateTemplate(agentId: number, templateId: number, data: { components: Record<string, unknown>[]; header_handle?: string }): Promise<WhatsAppTemplate> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update template');
  }
  return res.json();
}

export async function deleteTemplate(agentId: number, templateId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/templates/${templateId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete template');
}
