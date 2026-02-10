/**
 * Authentication types and utilities
 */

export type UserRole = 'super_admin' | 'admin' | 'employee';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  parent_id?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// Storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';

// ============ Token Management ============

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

// ============ Role Checks ============

export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.role === 'super_admin';
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin';
}

export function isEmployee(user: AuthUser | null): boolean {
  return user?.role === 'employee';
}

export function canManageAgents(user: AuthUser | null): boolean {
  return user?.role === 'super_admin';
}

export function canManageUsers(user: AuthUser | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

export function canUploadContent(user: AuthUser | null): boolean {
  return user?.role === 'super_admin';
}
