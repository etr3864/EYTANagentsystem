export function parseTryDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function localDayKey(iso?: string | null): string {
  const d = parseTryDate(iso);
  if (!d) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function isNewDay(
  current?: string | null,
  previous?: string | null,
  isFirst = false,
): boolean {
  const today = localDayKey(current);
  if (!today) return false;
  const before = localDayKey(previous);
  if (!before) return isFirst;
  return today !== before;
}

export function formatTime(iso?: string | null): string {
  const d = parseTryDate(iso);
  if (!d) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(iso?: string | null): string {
  const d = parseTryDate(iso);
  if (!d) return '';
  if (d.toDateString() === new Date().toDateString()) return 'היום';
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
