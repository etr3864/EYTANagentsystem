'use client';

import { DateRangePicker } from './DateRangePicker';
import { PRESETS, type Preset } from './datePresets';

interface Props {
  preset: Preset | null;
  activeDates: { from: string; to: string };
  onPresetChange: (p: Preset) => void;
  onCustomRange: (from: string, to: string) => void;
}

export function PresetBar({ preset, activeDates, onPresetChange, onCustomRange }: Props) {
  const isCustom = preset === null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPresetChange(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              preset === p.id
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DateRangePicker
        from={activeDates.from}
        to={activeDates.to}
        isCustom={isCustom}
        onChange={onCustomRange}
      />
    </div>
  );
}
