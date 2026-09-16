'use client';

import { useState } from 'react';
import { PrivacyContent, getPrivacyTitle, type Lang } from '@/components/ui/LegalModals';

export default function PrivacyPage() {
  const [lang, setLang] = useState<Lang>('en');
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div dir={dir} className="min-h-screen bg-[var(--bg-secondary)] py-12 px-4">
      <div className="max-w-2xl mx-auto bg-[var(--glass-2)] rounded-xl p-8 text-gray-300 text-sm leading-relaxed">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[var(--ink)]">{getPrivacyTitle(lang)}</h1>
          <button
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="px-3 py-1 text-xs rounded border border-[var(--edge)] text-[var(--text-secondary)] hover:text-[var(--ink)] hover:border-[var(--edge-strong)] transition"
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>
        <PrivacyContent lang={lang} />
      </div>
    </div>
  );
}
