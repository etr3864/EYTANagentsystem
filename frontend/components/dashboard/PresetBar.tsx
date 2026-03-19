'use client';

import { DateRangePicker } from './DateRangePicker';
import { PRESETS, type Preset } from './datePresets';

interface Props {
  preset: Preset;
  customFrom: string;
  customTo: string;
  onPresetChange: (p: Preset) => void;
  onCustomRange: (from: string, to: string) => void;
}

export function PresetBar({ preset, customFrom, customTo, onPresetChange, onCustomRange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => p.id !== 'custom' && onPresetChange(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              preset === p.id
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            } ${p.id === 'custom' ? 'cursor-default' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DateRangePicker
        from={preset === 'custom' ? customFrom : ''}
        to={preset === 'custom' ? customTo : ''}
        onChange={onCustomRange}
      />
    </div>
  );
}
