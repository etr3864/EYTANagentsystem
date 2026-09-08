import { API_URL, authFetch } from './client';

export type UserRole = 'super_admin' | 'admin' | 'employee';

export interface AuthUserResponse {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
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
