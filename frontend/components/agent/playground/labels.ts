export const LINK_STATUS: Record<string, string> = {
  active: 'פעיל',
  stopped: 'עצור',
  expired: 'פג',
  deleted: 'נמחק',
  agent_inactive: 'סוכן כבוי',
  agent_gone: 'סוכן לא קיים',
};

export const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  stopped: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  expired: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  deleted: 'bg-red-500/15 text-red-300 border-red-500/25',
  agent_inactive: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  agent_gone: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
};

export function statusBadge(status: string): string {
  return STATUS_TONE[status] || STATUS_TONE.expired;
}

export function publicUrl(path: string | null): string | null {
  if (!path || typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function tokensLabel(used: number, limit: number): string {
  if (!limit) return '';
  return `${used.toLocaleString('he-IL')} / ${limit.toLocaleString('he-IL')} טוקנים`;
}
