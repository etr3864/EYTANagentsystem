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

export const MIN_TOKEN_LIMIT = 1_000_000;
export const MAX_TOKEN_LIMIT = 50_000_000;
export const DEFAULT_TOKEN_LIMIT = 1_000_000;

/** One user message + one agent reply, billed as a full LLM turn. */
const TOKENS_PER_TURN = 8_000;

export const TOKEN_LIMIT_PRESETS = [
  { tokens: 1_000_000, label: 'מיליון' },
  { tokens: 2_000_000, label: '2 מיליון' },
  { tokens: 5_000_000, label: '5 מיליון' },
  { tokens: 10_000_000, label: '10 מיליון' },
] as const;

export function parseTokenLimit(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export function formatTokenLimit(n: number): string {
  return n.toLocaleString('he-IL');
}

export function estimateMessages(tokens: number): number {
  if (tokens <= 0) return 0;
  return Math.max(2, Math.round((tokens / TOKENS_PER_TURN) * 2));
}

export function messagesApproxLabel(tokens: number): string {
  return `בערך ${estimateMessages(tokens).toLocaleString('he-IL')} הודעות (משתמש וסוכן)`;
}

export function tokenLimitError(n: number | null): string | null {
  if (n == null) return 'הקלד תקרת טוקנים';
  if (n < MIN_TOKEN_LIMIT) return 'מינימום מיליון טוקנים';
  if (n > MAX_TOKEN_LIMIT) return 'מקסימום 50 מיליון טוקנים';
  return null;
}

export function tokensLabel(used: number, limit: number): string {
  if (!limit) return '';
  return `${used.toLocaleString('he-IL')} / ${limit.toLocaleString('he-IL')} טוקנים · ${messagesApproxLabel(limit)}`;
}
