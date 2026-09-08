import type {
  DbAppointment,
  DbChannel,
  DbChannelUser,
  DbConversation,
  DbFollowup,
  DbMedia,
  DbMessage,
  DbReminder,
  DbSummary,
  DbTemplate,
} from '../types';
import { API_URL, authFetch } from './client';

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

async function fetchDbPage<T>(path: string, page = 1, perPage = 50): Promise<PaginatedResponse<T>> {
  const res = await authFetch(`${API_URL}/api/db/${path}?page=${page}&per_page=${perPage}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

async function deleteDbRecord(path: string, id: number): Promise<void> {
  const res = await authFetch(`${API_URL}/api/db/${path}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to delete ${path}/${id}`);
  }
}

export const getDbConversations = (page?: number) => fetchDbPage<DbConversation>('conversations', page);
export const getDbMessages = (page?: number) => fetchDbPage<DbMessage>('messages', page);
export const getDbAppointments = (page?: number) => fetchDbPage<DbAppointment>('appointments', page);
export const getDbReminders = (page?: number) => fetchDbPage<DbReminder>('reminders', page);
export const getDbSummaries = (page?: number) => fetchDbPage<DbSummary>('summaries', page);
export const getDbMedia = (page?: number) => fetchDbPage<DbMedia>('media', page);
export const getDbChannels = (page?: number) => fetchDbPage<DbChannel>('channels', page);
export const getDbChannelUsers = (page?: number) => fetchDbPage<DbChannelUser>('channel-users', page);

export const deleteDbMessage = (id: number) => deleteDbRecord('messages', id);
export const deleteDbAppointment = (id: number) => deleteDbRecord('appointments', id);
export const deleteDbReminder = (id: number) => deleteDbRecord('reminders', id);
export const deleteDbSummary = (id: number) => deleteDbRecord('summaries', id);
export const deleteDbMedia = (id: number) => deleteDbRecord('media', id);
export const deleteDbChannel = (id: number) => deleteDbRecord('channels', id);
export const deleteDbChannelUser = (id: number) => deleteDbRecord('channel-users', id);

export const getDbTemplates = (page?: number) => fetchDbPage<DbTemplate>('templates', page);
export const deleteDbTemplate = (id: number) => deleteDbRecord('templates', id);

export const getDbFollowups = (page?: number) => fetchDbPage<DbFollowup>('followups', page);

export const deleteDbFollowup = (id: number) => deleteDbRecord('followups', id);
