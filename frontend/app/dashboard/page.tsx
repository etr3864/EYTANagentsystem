'use client';

import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { Button, ArrowRightIcon } from '@/components/ui';

function DashboardContent() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" icon={<ArrowRightIcon />} />
          </Link>
          <h1 className="text-2xl font-bold text-white">דאשבורד</h1>
        </div>
        <AdminDashboard />
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
