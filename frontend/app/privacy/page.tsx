'use client';

import { useState } from 'react';
import { PrivacyContent, getPrivacyTitle, type Lang } from '@/components/ui/LegalModals';

export default function PrivacyPage() {
  const [lang, setLang] = useState<Lang>('en');
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div dir={dir} className="min-h-screen bg-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-xl p-8 text-gray-300 text-sm leading-relaxed">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{getPrivacyTitle(lang)}</h1>
          <button
            onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            className="px-3 py-1 text-xs rounded border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition"
          >
            {lang === 'he' ? 'EN' : 'עב'}
          </button>
        </div>
        <PrivacyContent lang={lang} />
      </div>
    </div>
  );
}
