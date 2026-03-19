'use client';

import { useState } from 'react';
import Link from 'next/link';

const LOGO_ICON = 'https://res.cloudinary.com/daowx6msw/image/upload/v1761607495/white_logogg_uf3usn.png';

type Lang = 'he' | 'en';

const content = {
  he: {
    heroTitle: 'סוכני WhatsApp חכמים',
    heroTitleAccent: 'מבוססי בינה מלאכותית',
    heroSub: 'פלטפורמה מתקדמת ליצירה, ניהול ותפעול של סוכני AI אוטונומיים ב-WhatsApp — שיחות טבעיות, תיאום פגישות ומעקב לקוחות, 24/7.',
    login: 'כניסה למערכת',
    featuresTitle: 'יכולות הפלטפורמה',
    features: [
      {
        icon: '💬',
        title: 'שיחות AI טבעיות',
        desc: 'סוכנים מנהלים שיחות מורכבות בעברית ובאנגלית, עם הבנת הקשר, ניתוח תמונות ותמלול הודעות קוליות.',
      },
      {
        icon: '📅',
        title: 'תיאום פגישות ביומן Google',
        desc: 'אינטגרציה עם Google Calendar — הסוכן בודק זמינות, מציע מועדים ומתאם פגישות ישירות ליומן שלך.',
      },
      {
        icon: '🔄',
        title: 'מעקב לקוחות אוטומטי',
        desc: 'מנגנון Follow-up חכם שולח הודעות המשך ללקוחות לפי רצף מוגדר מראש, בזמן הנכון.',
      },
      {
        icon: '📊',
        title: 'סיכומי שיחה ודוחות',
        desc: 'סיכום אוטומטי של שיחות עם שליחה ל-webhook — כדי שתמיד תדע מה קורה עם הלקוחות שלך.',
      },
      {
        icon: '🔐',
        title: 'אבטחה ושליטה מלאה',
        desc: 'ניהול משתמשים עם הרשאות, הצפנת נתונים, ומערכת הרשאות מבוססת תפקידים.',
      },
      {
        icon: '📁',
        title: 'מאגר ידע ומדיה',
        desc: 'העלאת מסמכים, תמונות וקבצים — הסוכן משתמש בהם בשיחות עם חיפוש סמנטי חכם.',
      },
    ],
    calendarTitle: 'אינטגרציה עם Google Calendar',
    calendarDesc: 'הפלטפורמה שלנו מתחברת ליומן Google שלך כדי לאפשר לסוכן ה-AI לנהל פגישות בשמך. הנתונים משמשים אך ורק לבדיקת זמינות ותיאום פגישות — ללא שימוש לשיווק, פרסום, או כל מטרה אחרת.',
    calendarPoints: [
      'בדיקת זמינות ביומן בזמן אמת',
      'קביעת פגישות חדשות ביומן שלך',
      'שליחת תזכורות אוטומטיות ללקוחות',
      'ניתן לנתק את הגישה ליומן בכל עת',
    ],
    companyTitle: 'מי אנחנו',
    companyDesc: 'Optive Ltd. היא חברת טכנולוגיה ישראלית המתמחה בפיתוח פתרונות בינה מלאכותית לעסקים. אנחנו בונים סוכני AI אוטונומיים שפועלים 24/7 ומייצרים ערך עסקי אמיתי — שיחות טבעיות, תיאום פגישות, מעקב לקוחות ועוד.',
    privacy: 'מדיניות פרטיות',
    terms: 'תנאי שימוש',
    rights: '© 2026 Optive Ltd. כל הזכויות שמורות.',
    contact: 'צרו קשר',
  },
  en: {
    heroTitle: 'Smart WhatsApp Agents',
    heroTitleAccent: 'Powered by AI',
    heroSub: 'An advanced platform for creating, managing, and operating autonomous AI agents on WhatsApp — natural conversations, appointment scheduling, and customer follow-ups, 24/7.',
    login: 'Sign In',
    featuresTitle: 'Platform Capabilities',
    features: [
      {
        icon: '💬',
        title: 'Natural AI Conversations',
        desc: 'Agents handle complex conversations in Hebrew and English, with context awareness, image analysis, and voice message transcription.',
      },
      {
        icon: '📅',
        title: 'Google Calendar Scheduling',
        desc: 'Integration with Google Calendar — the agent checks availability, suggests times, and books appointments directly to your calendar.',
      },
      {
        icon: '🔄',
        title: 'Automated Follow-ups',
        desc: 'Smart follow-up mechanism sends messages to customers based on a predefined sequence, at the right time.',
      },
      {
        icon: '📊',
        title: 'Conversation Summaries & Reports',
        desc: 'Automatic conversation summaries sent via webhook — so you always know what\'s happening with your customers.',
      },
      {
        icon: '🔐',
        title: 'Security & Full Control',
        desc: 'User management with permissions, data encryption, and role-based access control.',
      },
      {
        icon: '📁',
        title: 'Knowledge Base & Media',
        desc: 'Upload documents, images, and files — the agent uses them in conversations with smart semantic search.',
      },
    ],
    calendarTitle: 'Google Calendar Integration',
    calendarDesc: 'Our platform connects to your Google Calendar to allow the AI agent to manage appointments on your behalf. Data is used solely for availability checks and appointment scheduling — never for marketing, advertising, or any other purpose.',
    calendarPoints: [
      'Real-time calendar availability checks',
      'Schedule new appointments to your calendar',
      'Send automated reminders to customers',
      'Calendar access can be revoked at any time',
    ],
    companyTitle: 'About Us',
    companyDesc: 'Optive Ltd. is an Israeli technology company specializing in AI solutions for businesses. We build autonomous AI agents that operate 24/7 and deliver real business value — natural conversations, appointment scheduling, customer follow-ups, and more.',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    rights: '© 2026 Optive Ltd. All rights reserved.',
    contact: 'Contact Us',
  },
} as const;

export default function HomePage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = content[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div dir={dir} className="min-h-screen bg-[#06060E] text-white overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-purple-600/[0.07] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/[0.05] blur-[100px]" />
      </div>

      <div className="relative z-10">
        {/* ───── Navbar ───── */}
        <nav className="border-b border-white/5 backdrop-blur-md bg-[#06060E]/70 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={LOGO_ICON} alt="Optive" className="h-11 w-11 object-contain" />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition"
              >
                {lang === 'he' ? 'EN' : 'עב'}
              </button>
              <Link
                href="/login"
                className="px-5 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 transition shadow-lg shadow-purple-600/20"
              >
                {t.login}
              </Link>
            </div>
          </div>
        </nav>

        {/* ───── Hero ───── */}
        <section className="max-w-5xl mx-auto px-5 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm text-slate-300 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Optive AI Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight tracking-tight">
            {t.heroTitle}
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-violet-500 to-purple-600 bg-clip-text text-transparent">
              {t.heroTitleAccent}
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            {t.heroSub}
          </p>

          <div className="mt-10">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-medium rounded-xl bg-purple-600 hover:bg-purple-500 transition shadow-xl shadow-purple-600/25"
            >
              {t.login}
              <svg className={`w-4 h-4 ${lang === 'he' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </section>

        {/* ───── Features Grid ───── */}
        <section className="max-w-6xl mx-auto px-5 py-20">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-14">
            {t.featuresTitle}
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.features.map((f, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───── Google Calendar Section ───── */}
        <section className="max-w-5xl mx-auto px-5 py-20">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 sm:p-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z" />
                </svg>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">{t.calendarTitle}</h2>
            </div>

            <p className="text-slate-400 leading-relaxed mb-6 max-w-3xl">
              {t.calendarDesc}
            </p>

            <ul className="space-y-3">
              {t.calendarPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-slate-300 text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───── About ───── */}
        <section className="max-w-5xl mx-auto px-5 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">{t.companyTitle}</h2>
          <p className="text-slate-400 leading-relaxed max-w-2xl mx-auto">
            {t.companyDesc}
          </p>
        </section>

        {/* ───── Footer ───── */}
        <footer className="border-t border-white/5 bg-[#06060E]/80 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-5 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={LOGO_ICON} alt="Optive" className="h-7 w-7 object-contain opacity-60" />
                <span className="text-sm text-slate-500">{t.rights}</span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <Link href="/privacy" className="text-slate-400 hover:text-white transition">
                  {t.privacy}
                </Link>
                <span className="text-slate-700">|</span>
                <Link href="/terms" className="text-slate-400 hover:text-white transition">
                  {t.terms}
                </Link>
                <span className="text-slate-700">|</span>
                <a href="mailto:support@0ptive.com" className="text-slate-400 hover:text-white transition">
                  {t.contact}
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
