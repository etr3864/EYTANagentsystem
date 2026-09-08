import type { DataTable, DataTableDetail, Document, DocumentDetail } from '../types';
import { getAccessToken } from '../auth';
import { API_URL, authFetch } from './client';

export async function getDocuments(agentId: number): Promise<Document[]> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

async function knowledgeError(res: Response): Promise<Error> {
  try {
    const data = await res.json();
    return new Error(typeof data.detail === 'string' ? data.detail : 'הפעולה נכשלה');
  } catch {
    return new Error('הפעולה נכשלה');
  }
}

export async function uploadDocument(
  agentId: number,
  file: File,
  title: string,
  onProgress?: (progress: number) => void
): Promise<Document> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

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
  if (!res.ok) throw await knowledgeError(res);
}

export async function getDocument(agentId: number, docId: number): Promise<DocumentDetail> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents/${docId}`);
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}

export async function createTextDocument(
  agentId: number,
  title: string,
  content: string,
): Promise<Document> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content }),
  });
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}

export async function updateDocument(
  agentId: number,
  docId: number,
  data: { title?: string; content?: string },
): Promise<DocumentDetail> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents/${docId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}

export async function bulkDeleteDocuments(agentId: number, ids: number[]): Promise<number> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/documents/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw await knowledgeError(res);
  const data = await res.json();
  return data.deleted;
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
  if (!res.ok) throw await knowledgeError(res);
}

export async function getDataTable(agentId: number, tableId: number): Promise<DataTableDetail> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/tables/${tableId}`);
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}

export async function createBlankTable(
  agentId: number,
  name: string,
  columns: string[],
): Promise<DataTable> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/tables/blank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, columns }),
  });
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}

export async function updateDataTable(
  agentId: number,
  tableId: number,
  data: { name?: string; columns: string[]; rows: Record<string, string>[] },
): Promise<DataTableDetail> {
  const res = await authFetch(`${API_URL}/api/agents/${agentId}/knowledge/tables/${tableId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await knowledgeError(res);
  return res.json();
}
