import { Heebo } from 'next/font/google';
import { TryApp } from '@/components/try/TryApp';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover' as const,
  interactiveWidget: 'resizes-content' as const,
};

export default async function TryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className={heebo.className}>
      <TryApp token={token} />
    </div>
  );
}
