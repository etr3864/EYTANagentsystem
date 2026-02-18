'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthUser,
  TokenResponse,
  LoginCredentials,
  getAccessToken,
  getStoredUser,
  setTokens,
  setUser,
  clearAuth,
  isAuthenticated as checkIsAuthenticated,
} from '@/lib/auth';

// API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL 
  || (typeof window !== 'undefined' && window.location.hostname.includes('onrender.com') 
      ? 'https://whatsapp-backend-6wwn.onrender.com' 
      : 'http://localhost:8000');

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser && checkIsAuthenticated()) {
      setUserState(storedUser);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Login failed');
    }

    const data: TokenResponse = await res.json();
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    setUserState(data.user);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUserState(null);
    router.push('/login');
  }, [router]);

  const refreshUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      logout();
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch user');
      }

      const userData: AuthUser = await res.json();
      setUser(userData);
      setUserState(userData);
    } catch {
      logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && checkIsAuthenticated(),
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
