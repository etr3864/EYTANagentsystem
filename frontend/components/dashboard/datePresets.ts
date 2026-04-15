export type Preset = 'today' | '7d' | 'week' | '30d' | 'month' | '90d' | 'all';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today',  label: 'היום' },
  { id: '7d',     label: '7 ימים אחרונים' },
  { id: 'week',   label: 'השבוע' },
  { id: '30d',    label: '30 ימים אחרונים' },
  { id: 'month',  label: 'החודש' },
  { id: '90d',    label: '90 ימים אחרונים' },
  { id: 'all',    label: 'הכל' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function getPresetDates(preset: Preset): { from: string; to: string } {
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
      // Current week: Sunday → today
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - today.getDay());
      return { from: fmt(sunday), to: todayStr };
    }

    case '30d': {
      const d = new Date(today);
      d.setDate(today.getDate() - 29);
      return { from: fmt(d), to: todayStr };
    }

    case 'month': {
      // Current month: 1st → today
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(first), to: todayStr };
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
