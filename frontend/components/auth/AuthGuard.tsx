'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/auth';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip redirect during loading
    if (isLoading) return;

    if (!isAuthenticated) {
      const fullPath = pathname + window.location.search;
      const loginUrl = fullPath && fullPath !== '/'
        ? `/login?redirect=${encodeURIComponent(fullPath)}`
        : '/login';
      router.push(loginUrl);
      return;
    }

    // Check role access if specified
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      // Redirect to home if user doesn't have required role
      router.push('/');
    }
  }, [isAuthenticated, isLoading, user, allowedRoles, router, pathname]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">טוען...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Don't render if user doesn't have required role
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
