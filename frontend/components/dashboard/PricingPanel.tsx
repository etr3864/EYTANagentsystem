'use client';

import { useState, useRef } from 'react';
import { getPricingConfig, updatePricingConfig } from '@/lib/api';
import { ALL_MODELS, MODEL_PROVIDERS, formatUsdPerMillion } from '@/lib/models';

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
    <div className="border border-[var(--edge)] rounded-xl overflow-hidden" dir="rtl">
      <button
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-5 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--glass)] transition-colors"
      >
        <span className="font-medium">הגדרות תמחור</span>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-5 pb-5 bg-[var(--glass)] space-y-5">
          {!loaded ? (
            <div className="py-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {MODEL_PROVIDERS.map(({ provider, icon }) => {
                const models = ALL_MODELS.filter((m) => m.provider === provider);
                if (models.length === 0) return null;
                return (
                  <div key={provider} className="space-y-3 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                      <span>{icon}</span> {provider}
                    </h4>
                    {models.map(({ key, label, inputPrice, outputPrice }) => (
                      <div key={key} className="grid grid-cols-3 gap-3 items-center">
                        <span className="text-sm text-[var(--text-secondary)] col-span-1">
                          {label}
                          <span className="block text-[11px] text-[var(--text-muted)]">{formatUsdPerMillion(inputPrice, outputPrice)}</span>
                        </span>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-[var(--text-secondary)]">Input $/1M</span>
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={config[`model.${key}.input`] ?? ''}
                            onChange={(e) => handleChange(`model.${key}.input`, e.target.value)}
                            className="bg-[var(--glass-2)] border border-[var(--edge)] rounded px-2 py-1.5 text-sm text-[var(--ink)] w-full focus:outline-none focus:border-[var(--acc)]"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-[var(--text-secondary)]">Output $/1M</span>
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={config[`model.${key}.output`] ?? ''}
                            onChange={(e) => handleChange(`model.${key}.output`, e.target.value)}
                            className="bg-[var(--glass-2)] border border-[var(--edge)] rounded px-2 py-1.5 text-sm text-[var(--ink)] w-full focus:outline-none focus:border-[var(--acc)]"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div className="border-t border-[var(--edge)] pt-4">
                <label className="flex items-center gap-3">
                  <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">שער דולר-שקל (₪/$)</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={config['usd_to_ils'] ?? ''}
                    onChange={(e) => handleChange('usd_to_ils', e.target.value)}
                    className="bg-[var(--glass-2)] border border-[var(--edge)] rounded px-2 py-1.5 text-sm text-[var(--ink)] w-32 focus:outline-none focus:border-[var(--acc)]"
                  />
                </label>
              </div>

              <div className="flex justify-start pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-[var(--ink)] hover:opacity-90 disabled:opacity-50 text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"
                >
                  {saved ? 'נשמר ✓' : saving ? 'שומר...' : 'שמור'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
