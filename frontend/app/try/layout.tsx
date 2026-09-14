import type { Metadata } from 'next';

const TITLE = 'קישור לבדיקת עובד הבינה המלאכותית שלך';
const DESCRIPTION = 'שיחה אישית עם הסוכן, בדיוק כמו בוואטסאפ.';

function siteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://whatsapp-frontend.onrender.com';
  return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    locale: 'he_IL',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
