'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Lang = 'en' | 'he';

const CONTACT_EMAIL = 'support@0ptive.com';

const content = {
  en: {
    title: 'Data Deletion',
    subtitle: 'Request the deletion of your personal data from the Optive platform.',
    statusBox: 'Your deletion request has been received.',
    statusBoxSub: 'Confirmation code:',
    statusInfo: 'Message content and channel-user records are deleted within 30 days. Operational backups are purged within an additional 60 days (90 days total).',
    methodsTitle: 'How to request deletion',
    methods: [
      {
        title: 'Email request',
        body: `Send an email to ${CONTACT_EMAIL} with the subject "Data Deletion Request" and include the relevant phone number, IGSID, PSID or business identifier.`,
      },
      {
        title: 'Facebook / Instagram / Messenger',
        body: 'Open Facebook Settings → Apps and Websites → select "Optive" → Remove. This triggers an automated deletion callback.',
      },
      {
        title: 'In-app',
        body: 'Sign in to your Optive account, open Settings → Account, and click "Delete account". All associated data is queued for deletion.',
      },
    ],
    scopeTitle: 'What gets deleted',
    scope: [
      'Connected channel accounts (WhatsApp, Instagram, Messenger)',
      'Channel-user identifiers (phone numbers, BSUID, IGSID, PSID)',
      'Conversations and message content tied to those identifiers',
      'Encrypted credentials and webhook secrets',
    ],
    timeline: 'We respond to all verified requests within 30 days. Backups are purged within an additional 60 days.',
    backHome: 'Back to home',
    privacy: 'Privacy Policy',
  },
  he: {
    title: 'מחיקת נתונים',
    subtitle: 'בקשה למחיקת נתוניך האישיים מפלטפורמת Optive.',
    statusBox: 'בקשת המחיקה שלך התקבלה.',
    statusBoxSub: 'קוד אישור:',
    statusInfo: 'תוכן הודעות ורשומות ערוץ-משתמש נמחקים תוך 30 יום. גיבויי תפעול נמחקים תוך 60 ימים נוספים (90 יום סך הכל).',
    methodsTitle: 'איך מבקשים מחיקה',
    methods: [
      {
        title: 'בקשה באימייל',
        body: `שלח אימייל לכתובת ${CONTACT_EMAIL} עם הנושא "בקשת מחיקת נתונים", וצרף את מספר הטלפון, IGSID, PSID או מזהה עסק רלוונטי.`,
      },
      {
        title: 'Facebook / Instagram / Messenger',
        body: 'פתח את הגדרות Facebook → אפליקציות ואתרים → בחר "Optive" → הסר. פעולה זו מפעילה callback מחיקה אוטומטי.',
      },
      {
        title: 'מתוך המערכת',
        body: 'התחבר לחשבון Optive שלך, היכנס להגדרות → חשבון, ולחץ "מחק חשבון". כל הנתונים המקושרים יוכנסו לתור למחיקה.',
      },
    ],
    scopeTitle: 'מה נמחק',
    scope: [
      'חשבונות ערוצים מחוברים (WhatsApp, Instagram, Messenger)',
      'מזהי ערוץ-משתמש (מספרי טלפון, BSUID, IGSID, PSID)',
      'שיחות ותוכן הודעות הקשורים למזהים אלה',
      'Credentials מוצפנים ו-webhook secrets',
    ],
    timeline: 'אנחנו מטפלים בכל בקשה מאומתת תוך 30 יום. גיבויים נמחקים תוך 60 ימים נוספים.',
    backHome: 'חזרה לעמוד הבית',
    privacy: 'מדיניות פרטיות',
  },
} as const;

function DataDeletionInner() {
  const params = useSearchParams();
  const code = params.get('code');
  const [lang, setLang] = useState<Lang>('en');
  const t = content[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div dir={dir} className="min-h-screen bg-slate-900 text-slate-200 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/home" className="text-sm text-slate-400 hover:text-white transition">
            ← {t.backHome}
          </Link>
          <button
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="px-3 py-1 text-xs rounded border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition"
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
        <p className="text-slate-400 mb-8">{t.subtitle}</p>

        {code && (
          <div className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <p className="text-emerald-300 font-semibold">{t.statusBox}</p>
            <p className="text-sm text-slate-300 mt-2">
              {t.statusBoxSub} <code className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300">{code}</code>
            </p>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">{t.statusInfo}</p>
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">{t.methodsTitle}</h2>
          <div className="space-y-3">
            {t.methods.map((m, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="text-white font-semibold mb-1">{m.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">{t.scopeTitle}</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-300 rtl:pr-4 ltr:pl-4">
            {t.scope.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        <p className="text-xs text-slate-500 mb-6 leading-relaxed">{t.timeline}</p>

        <Link href="/privacy" className="text-sm text-blue-400 hover:underline">
          {t.privacy}
        </Link>
      </div>
    </div>
  );
}

export default function DataDeletionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <DataDeletionInner />
    </Suspense>
  );
}
