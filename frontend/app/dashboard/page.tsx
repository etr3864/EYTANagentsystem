'use client';

import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { SuperAdminDashboard } from '@/components/dashboard/SuperAdminDashboard';
import { Button, ArrowRightIcon } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

function DashboardContent() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" icon={<ArrowRightIcon />} />
          </Link>
          <h1 className="text-2xl font-bold text-white">
            {isSuperAdmin ? 'דאשבורד מערכת' : 'דאשבורד'}
          </h1>
        </div>
        {isSuperAdmin ? <SuperAdminDashboard /> : <AdminDashboard />}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard allowedRoles={['admin', 'super_admin']}>
      <DashboardContent />
    </AuthGuard>
  );
}
