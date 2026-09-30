'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { Wizard } from '@/components/campaigns/Wizard';

export default function NewCampaignPage() {
  return (
    <AuthGuard>
      <Wizard />
    </AuthGuard>
  );
}
