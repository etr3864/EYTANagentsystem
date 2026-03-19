export type Preset = 'today' | '7d' | 'week' | '30d' | 'month' | '90d' | 'custom' | 'all';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: '7d', label: '7 ימים' },
  { id: 'week', label: 'שבוע' },
  { id: '30d', label: '30 ימים' },
  { id: 'month', label: 'חודש' },
  { id: '90d', label: '90 ימים' },
  { id: 'custom', label: 'מותאם' },
  { id: 'all', label: 'הכל' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function getPresetDates(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const today = new Date();
  const todayStr = fmt(today);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case '7d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 6);
      return { from: fmt(d), to: todayStr };
    }
    case 'week': {
      const dayOfWeek = today.getDay();
      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - dayOfWeek - 7);
      const lastSaturday = new Date(lastSunday);
      lastSaturday.setDate(lastSunday.getDate() + 6);
      return { from: fmt(lastSunday), to: fmt(lastSaturday) };
    }
    case '30d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 29);
      return { from: fmt(d), to: todayStr };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(first), to: fmt(last) };
    }
    case '90d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 89);
      return { from: fmt(d), to: todayStr };
    }
    case 'all':
      return { from: '2020-01-01', to: todayStr };
  }
}
