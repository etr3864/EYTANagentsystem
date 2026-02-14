import type { Agent, AgentCreate, AgentUpdate, User, Conversation, Message, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, Document, DataTable, Provider, WaSenderConfig, DbMedia, AgentMedia, MediaConfig, WhatsAppTemplate, DbTemplate, MetaInfo } from './types';
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
  name?: string;  // Optional for images/documents - auto-generated by AI
  media_type: 'image' | 'video' | 'document';
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

// ============ Auth Users Management ============

export type UserRole = 'super_admin' | 'admin' | 'employee';

export interface AuthUserResponse {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  parent_id?: number;
  parent_name?: string;  // For employees - shows their admin's name
}

export interface AuthUserWithAgents extends AuthUserResponse {
  agent_ids: number[];
}

export interface CreateAdminRequest {
  email: string;
  password: string;
  name: string;
}

export interface CreateEmployeeRequest {
  email: string;
  password: string;
  name: string;
}

export interface UpdateUserRequest {
  name?: string;
  is_active?: boolean;
}

export interface ResetPasswordRequest {
  new_password: string;
}

// Admins (Super Admin only)
export async function getAdmins(): Promise<{ admins: AuthUserWithAgents[]; total: number }> {
  const res = await authFetch(`${API_URL}/api/auth/admins`);
  if (!res.ok) throw new Error('Failed to fetch admins');
  return res.json();
}

export async function getAdmin(id: number): Promise<AuthUserWithAgents> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${id}`);
  if (!res.ok) throw new Error('Failed to fetch admin');
  return res.json();
}

export async function createAdmin(data: CreateAdminRequest): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to create admin' }));
    throw new Error(error.detail || 'Failed to create admin');
  }
  return res.json();
}

export async function updateAdmin(id: number, data: UpdateUserRequest): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update admin');
  return res.json();
}

export async function resetAdminPassword(id: number, data: ResetPasswordRequest): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to reset password');
}

export async function deleteAdmin(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to delete admin' }));
    throw new Error(error.detail || 'Failed to delete admin');
  }
}

// Super Admin Management
export async function getSuperAdmins(): Promise<AuthUserResponse[]> {
  const res = await authFetch(`${API_URL}/api/auth/super-admins`);
  if (!res.ok) throw new Error('Failed to fetch super admins');
  return res.json();
}

export async function createSuperAdmin(data: CreateAdminRequest): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/super-admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to create super admin' }));
    throw new Error(error.detail || 'Failed to create super admin');
  }
  return res.json();
}

export async function resetSuperAdminPassword(id: number, data: ResetPasswordRequest): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/super-admins/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to reset password');
}

export async function deleteSuperAdmin(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/super-admins/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to delete super admin' }));
    throw new Error(error.detail || 'Failed to delete super admin');
  }
}

// Agent Assignment (Super Admin only)
export async function assignAgentToAdmin(adminId: number, agentId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${adminId}/agents/${agentId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to assign agent');
}

export async function unassignAgentFromAdmin(adminId: number, agentId: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/admins/${adminId}/agents/${agentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to unassign agent');
}

export async function getUnassignedAgents(): Promise<{ id: number; name: string; phone_number_id: string; is_active: boolean }[]> {
  const res = await authFetch(`${API_URL}/api/auth/agents/unassigned`);
  if (!res.ok) throw new Error('Failed to fetch unassigned agents');
  return res.json();
}

// Employees (Admin or Super Admin)
export async function getEmployees(): Promise<{ employees: AuthUserResponse[]; total: number }> {
  const res = await authFetch(`${API_URL}/api/auth/employees`);
  if (!res.ok) throw new Error('Failed to fetch employees');
  return res.json();
}

export async function getEmployee(id: number): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/employees/${id}`);
  if (!res.ok) throw new Error('Failed to fetch employee');
  return res.json();
}

export async function createEmployee(data: CreateEmployeeRequest): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Failed to create employee' }));
    throw new Error(error.detail || 'Failed to create employee');
  }
  return res.json();
}

export async function updateEmployee(id: number, data: UpdateUserRequest): Promise<AuthUserResponse> {
  const res = await authFetch(`${API_URL}/api/auth/employees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update employee');
  return res.json();
}

export async function resetEmployeePassword(id: number, data: ResetPasswordRequest): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/employees/${id}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to reset password');
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/auth/employees/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete employee');
}

// ============ DB Templates ============

export async function getDbTemplates(): Promise<DbTemplate[]> {
  const res = await authFetch(`${API_URL}/api/db/templates`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function deleteDbTemplate(id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete template');
}

// ============ WhatsApp Templates ============

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

// Re-export types
export type { Agent, AgentCreate, AgentUpdate, AgentBatchingConfig, Provider, WaSenderConfig, User, Gender, Conversation, Message, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, Document, DataTable, DbMedia, AgentMedia, MediaConfig, MediaType, WhatsAppTemplate, TemplateCategory, TemplateStatus, DbTemplate } from './types';
