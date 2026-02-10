import type { Agent, AgentCreate, AgentUpdate, User, Conversation, Message, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, Document, DataTable, Provider, WaSenderConfig, DbMedia, AgentMedia, MediaConfig } from './types';
import { getAccessToken, clearAuth } from './auth';

// Production URL or environment variable or localhost for development
const API_URL = process.env.NEXT_PUBLIC_API_URL 
  || (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com') 
      ? 'https://whatsapp-backend-6wwn.onrender.com' 
      : 'http://localhost:8000');

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Helper for authenticated fetch
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };
  
  const res = await fetch(url, { ...options, headers });
  
  // Handle 401 - redirect to login
  if (res.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
  
  return res;
}

// ============ Agents ============
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

export async function createAgent(data: AgentCreate): Promise<{ id: number }> {
  const res = await authFetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create agent');
  return res.json();
}

export async function updateAgent(id: number, data: AgentUpdate): Promise<{ id: number }> {
  const res = await authFetch(`${API_URL}/api/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update agent');
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

// ============ Conversations ============
export async function getConversations(agentId: number): Promise<Conversation[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/conversations`);
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

// ============ Database ============
export async function getDbConversations(): Promise<DbConversation[]> {
  const res = await authFetch(`${API_URL}/api/db/conversations`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function getDbMessages(limit = 100): Promise<DbMessage[]> {
  const res = await authFetch(`${API_URL}/api/db/messages?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function deleteDbMessage(msgId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/messages/${msgId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete message');
}

export async function getUsageStats(): Promise<UsageStats[]> {
  const res = await authFetch(`${API_URL}/api/db/usage`);
  if (!res.ok) throw new Error('Failed to fetch usage stats');
  return res.json();
}

// ============ Appointments ============
export async function getDbAppointments(): Promise<DbAppointment[]> {
  const res = await authFetch(`${API_URL}/api/db/appointments`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function deleteDbAppointment(aptId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/appointments/${aptId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete appointment');
}

// ============ Reminders ============
export async function getDbReminders(): Promise<DbReminder[]> {
  const res = await authFetch(`${API_URL}/api/db/reminders`);
  if (!res.ok) throw new Error('Failed to fetch reminders');
  return res.json();
}

export async function deleteDbReminder(reminderId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/reminders/${reminderId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete reminder');
}

// ============ Summaries ============
export async function getDbSummaries(): Promise<DbSummary[]> {
  const res = await authFetch(`${API_URL}/api/db/summaries`);
  if (!res.ok) throw new Error('Failed to fetch summaries');
  return res.json();
}

export async function deleteDbSummary(summaryId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/summaries/${summaryId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete summary');
}

// ============ DB Media ============
export async function getDbMedia(): Promise<DbMedia[]> {
  const res = await authFetch(`${API_URL}/api/db/media`);
  if (!res.ok) throw new Error('Failed to fetch media');
  return res.json();
}

export async function deleteDbMedia(mediaId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/media/${mediaId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete media');
}

// ============ Agent Media ============
export async function getAgentMedia(agentId: number, mediaType?: string): Promise<AgentMedia[]> {
  const url = mediaType 
    ? `${API_URL}/api/agents/${agentId}/media?media_type=${mediaType}`
    : `${API_URL}/api/agents/${agentId}/media`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Failed to fetch agent media');
  return res.json();
}

export interface MediaUploadData {
  name?: string;  // Optional for images - auto-generated by AI
  media_type: 'image' | 'video';
  description?: string;
  default_caption?: string;
  original_size?: number;  // Original size before compression
  auto_analyze?: boolean;  // Whether to auto-analyze images (default true)
}

export async function uploadAgentMedia(
  agentId: number,
  file: File,
  data: MediaUploadData,
  onProgress?: (progress: number) => void
): Promise<AgentMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('media_type', data.media_type);
    if (data.name) formData.append('name', data.name);
    if (data.description) formData.append('description', data.description);
    if (data.default_caption) formData.append('default_caption', data.default_caption);
    // Use provided original_size (before compression) or file.size
    const originalSize = data.original_size || file.size;
    formData.append('original_size', originalSize.toString());
    // Auto-analyze images by default
    formData.append('auto_analyze', (data.auto_analyze !== false).toString());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 70));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `${API_URL}/api/agents/${agentId}/media`);
    // Add auth header
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
    
    setTimeout(() => onProgress?.(85), 300);
  });
}

export async function updateAgentMedia(
  agentId: number,
  mediaId: number,
  data: { name?: string; description?: string; default_caption?: string; is_active?: boolean }
): Promise<AgentMedia> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/media/${mediaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update media');
  return res.json();
}

export async function deleteAgentMedia(agentId: number, mediaId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/media/${mediaId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete media');
}

// ============ Knowledge Base ============

export async function getDocuments(agentId: number): Promise<Document[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function uploadDocument(
  agentId: number, 
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ id: number; filename: string; chunks: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 50)); // Upload is 50%
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `${API_URL}/api/agents/${agentId}/knowledge/documents`);
    // Add auth header
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
    
    // Simulate processing progress after upload
    setTimeout(() => onProgress?.(75), 500);
  });
}

export async function deleteDocument(agentId: number, docId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents/${docId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete document');
}

export async function getDataTables(agentId: number): Promise<DataTable[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/tables`);
  if (!res.ok) throw new Error('Failed to fetch tables');
  return res.json();
}

export async function uploadDataTable(
  agentId: number,
  file: File,
  name: string,
  description?: string,
  onProgress?: (progress: number) => void
): Promise<{ id: number; name: string; rows: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    if (description) formData.append('description', description);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 50));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `${API_URL}/api/agents/${agentId}/knowledge/tables`);
    // Add auth header
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
    
    setTimeout(() => onProgress?.(75), 500);
  });
}

export async function deleteDataTable(agentId: number, tableId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/tables/${tableId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete table');
}

// Re-export types
export type { Agent, AgentCreate, AgentUpdate, AgentBatchingConfig, Provider, WaSenderConfig, User, Gender, Conversation, Message, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, Document, DataTable, DbMedia, AgentMedia, MediaConfig, MediaType } from './types';
