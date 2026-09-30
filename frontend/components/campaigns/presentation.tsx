import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui';
import type { CampaignRow } from '@/lib/api/campaigns';

const STATUS: Record<string, string> = {
  draft: 'טיוטה',
  running: 'רץ',
  paused: 'מושהה',
  finished: 'הסתיים',
  scheduled: 'מתוזמן',
  pending: 'ממתין',
  sending: 'נשלח עכשיו',
  sent: 'נשלח',
  failed: 'נכשל',
  skipped: 'דולג',
  blocked: 'חסום',
  invalid: 'לא תקין',
  uncertain: 'לא ברור',
  replied: 'ענה',
};

const SESSION: Record<string, string> = {
  connected: 'מחובר',
  connecting: 'מתחבר',
  need_scan: 'דורש סריקה',
  need_passkey: 'דורש אימות',
  disconnected: 'מנותק',
  logged_out: 'התנתק',
  expired: 'פג תוקף',
  unknown: 'לא ידוע',
};

const PAUSE: Record<string, string> = {
  session: 'הסשן מנותק',
  channel_refused: 'הערוץ מסרב',
  flag_off: 'המתג כבוי',
  agent_off: 'הסוכן כבוי',
  manual: 'הושהה ידנית',
  config: 'הוורקר לא יכול לפתוח את מפתח הסשן',
};

export function statusLabel(value: string) {
  return STATUS[value] || value;
}

export function sessionLabel(value: string) {
  return SESSION[value] || value;
}

export function pauseLabel(value: string) {
  return PAUSE[value] || 'מושהה';
}

export function reasonLabel(value: string | null) {
  if (!value) return '';
  const labels: Record<string, string> = {
    lease: 'השליחה נקטעה לפני שיצאה',
    recent: 'דיבר לאחרונה',
    replied: 'ענה',
    blocked: 'חסום',
    window: 'מחוץ לשעות',
    empty: 'הודעה ריקה',
    timeout: 'וואסנדר לא ענה',
    compose: 'הניסוח נכשל',
    model_busy: 'המודל עמוס',
    rate: 'וואסנדר ביקש לחכות',
    channel: 'הערוץ סירב',
    session: 'הסשן מנותק',
  };
  return labels[value] || value;
}

export function FlagSwitch({
  on,
  busy,
  onToggle,
}: {
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onToggle}
      aria-pressed={on}
      className={`relative h-6 w-12 rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-[var(--bg-tertiary)]'
      }`}
      title={on ? 'פעיל' : 'כבוי'}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  );
}

export function CampaignCard({ row, extra }: { row: CampaignRow; extra?: ReactNode }) {
  const live = row.status === 'running';
  return (
    <Card hover padding="none">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/campaigns/${row.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`status-dot ${live ? 'active' : 'inactive'}`} />
            <span className="truncate text-base font-semibold text-[var(--ink)]">{row.name}</span>
            <span className="rounded-full border border-[var(--edge)] bg-[var(--glass-2)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              {statusLabel(row.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {row.agent_name} · {sessionLabel(row.session)}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-4 text-sm">
          <Metric label="שליחה" value={`${row.send_percent}%`} />
          <Metric label="מענה" value={`${row.reply_percent}%`} />
          {extra}
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="font-semibold text-[var(--ink)]">{value}</div>
    </div>
  );
}
