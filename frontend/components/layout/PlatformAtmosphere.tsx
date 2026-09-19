'use client';

import { usePathname } from 'next/navigation';
import { Atmosphere } from '@/components/try/Atmosphere';

export function PlatformAtmosphere() {
  const pathname = usePathname();
  if (pathname === '/try' || pathname.startsWith('/try/') || pathname.startsWith('/wa-qr')) return null;
  return <Atmosphere fixed />;
}
