import { getAccessToken, clearAuth } from '../auth';

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
export { API_URL };
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
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
