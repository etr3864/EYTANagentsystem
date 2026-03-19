'use client';

import { useState, useRef } from 'react';
import { getPricingConfig, updatePricingConfig } from '@/lib/api';

const MODELS = [
  { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { key: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { key: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat' },
];

export function PricingPanel() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadedRef = useRef(false);

  const handleOpen = async () => {
    setOpen((prev) => !prev);
    if (!loadedRef.current) {
      loadedRef.current = true;
      const data = await getPricingConfig();
      setConfig(data.config);
      setLoaded(true);
    }
  };

  const handleChange = (key: string, raw: string) => {
    const val = parseFloat(raw);
    if (!isNaN(val)) setConfig((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updatePricingConfig(config);
      setConfig(updated.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden" dir="rtl">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors"
      >
        <span className="font-medium">הגדרות תמחור</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-5 pb-5 bg-slate-800/30 space-y-5">
          {!loaded ? (
            <div className="py-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Model pricing */}
              <div className="space-y-4 pt-4">
                {MODELS.map(({ key, label }) => (
                  <div key={key} className="grid grid-cols-3 gap-3 items-center">
                    <span className="text-sm text-slate-300 col-span-1">{label}</span>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400">Input $/1M</span>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={config[`model.${key}.input`] ?? ''}
                        onChange={(e) => handleChange(`model.${key}.input`, e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400">Output $/1M</span>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={config[`model.${key}.output`] ?? ''}
                        onChange={(e) => handleChange(`model.${key}.output`, e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-full focus:outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                ))}
              </div>

              {/* Exchange rate */}
              <div className="border-t border-slate-700 pt-4">
                <label className="flex items-center gap-3">
                  <span className="text-sm text-slate-300 whitespace-nowrap">שער דולר-שקל (₪/$)</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={config['usd_to_ils'] ?? ''}
                    onChange={(e) => handleChange('usd_to_ils', e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white w-32 focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <div className="flex justify-start pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {saved ? 'נשמר' : saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
