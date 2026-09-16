/**
 * Column definitions for the Database admin page.
 * Each export is an array of column configs consumed by DataTable.
 */
import type { Agent, User, DbConversation, DbMessage, DbAppointment, DbReminder, DbSummary, DbMedia, DbTemplate, DbFollowup, DbChannel, DbChannelUser } from '@/lib/types';
import { parseUTCDate } from '@/lib/dates';

// ─── Helpers ────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
      active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--glass-2)] text-[var(--text-secondary)]'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-[var(--text-muted)]'}`} />
      {active ? 'פעיל' : 'מושבת'}
    </span>
  );
}

function DateCell({ value, withTime }: { value: string | null; withTime?: boolean }) {
  const d = parseUTCDate(value);
  if (!d) return <span className="text-[var(--text-muted)] text-xs">—</span>;
  const formatted = withTime
    ? d.toLocaleString('he-IL')
    : d.toLocaleDateString('he-IL');
  return <span className="text-[var(--text-muted)] text-xs">{formatted}</span>;
}

function TagCell({ label, style }: { label: string; style: string }) {
  return <span className={`text-xs px-2 py-1 rounded ${style}`}>{label}</span>;
}

// ─── Agents ─────────────────────────────────────────────
export const agentColumns = [
  { key: 'id', header: 'ID', render: (a: Agent) => (
    <span className="font-mono text-[var(--text-secondary)]">{a.id}</span>
  )},
  { key: 'name', header: 'שם', render: (a: Agent) => (
    <span className="font-medium text-[var(--ink)]">{a.name}</span>
  )},
  { key: 'model', header: 'Model', render: (a: Agent) => (
    <span className="text-xs bg-[var(--glass-2)] px-2 py-1 rounded">
      {a.model.split('-').slice(0, 2).join(' ')}
    </span>
  )},
  { 
    key: 'calendar', 
    header: 'יומן', 
    render: (a: Agent) => {
      const cal = a.calendar_config;
      const hasTokens = !!cal?.google_tokens;
      const webhook = cal?.webhook_url as string | undefined;
      const hours = cal?.working_hours as Record<string, object | null> | undefined;
      const activeDays = hours ? Object.values(hours).filter(Boolean).length : 0;
      
      return (
        <div className="text-xs space-y-0.5">
          <div className={hasTokens ? 'text-emerald-400' : 'text-[var(--text-muted)]'}>
            {hasTokens ? '✓ מחובר' : '✗ לא מחובר'}
          </div>
          {hasTokens ? (
            <>
              <div className="text-[var(--text-secondary)]">{activeDays}/7 ימים פעילים</div>
              {webhook ? <div className="text-[var(--acc)]">webhook ✓</div> : null}
            </>
          ) : null}
        </div>
      );
    }
  },
  { 
    key: 'apt_prompt', 
    header: 'הנחיות תיאום', 
    render: (a: Agent) => (
      a.appointment_prompt ? (
        <span title={a.appointment_prompt} className="text-[var(--text-secondary)] text-xs">
          {a.appointment_prompt.slice(0, 30)}...
        </span>
      ) : (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      )
    ),
    className: 'max-w-[150px] truncate'
  },
  { key: 'status', header: 'סטטוס', render: (a: Agent) => <StatusBadge active={a.is_active} /> },
];

// ─── Users ──────────────────────────────────────────────
export const userColumns = [
  { key: 'id', header: 'ID', render: (u: User) => (
    <span className="font-mono text-[var(--text-secondary)]">{u.id}</span>
  )},
  { key: 'name', header: 'שם', render: (u: User) => (
    <span className="font-medium text-[var(--ink)]">{u.name || '—'}</span>
  )},
  { key: 'phone', header: 'טלפון', render: (u: User) => (
    <span className="font-mono text-[var(--text-secondary)] text-sm">{u.phone}</span>
  )},
  { 
    key: 'gender', 
    header: 'מגדר', 
    render: (u: User) => {
      if (u.gender === 'male') return <span className="text-[var(--acc)]">👨 זכר</span>;
      if (u.gender === 'female') return <span className="text-pink-400">👩 נקבה</span>;
      return <span className="text-[var(--text-muted)]">—</span>;
    }
  },
  { 
    key: 'metadata', 
    header: 'מידע נוסף', 
    render: (u: User) => {
      const meta = u.metadata;
      if (!meta) return <span className="text-[var(--text-muted)]">—</span>;
      const parts = [];
      if (meta.business_type) parts.push(meta.business_type as string);
      if (meta.notes) parts.push(meta.notes as string);
      return parts.length > 0 ? (
        <span className="text-[var(--text-secondary)] text-sm">{parts.join(' • ')}</span>
      ) : <span className="text-[var(--text-muted)]">—</span>;
    }
  },
  { key: 'updated', header: 'עודכן', render: (u: User) => <DateCell value={u.updated_at || null} /> },
];

// ─── Conversations ──────────────────────────────────────
export const conversationColumns = [
  { key: 'id', header: 'ID', render: (c: DbConversation) => (
    <span className="font-mono text-[var(--text-secondary)]">{c.id}</span>
  )},
  { key: 'agent', header: 'Agent', render: (c: DbConversation) => (
    <span className="text-[var(--acc)]">#{c.agent_id}</span>
  )},
  { key: 'user', header: 'User', render: (c: DbConversation) => (
    <span className="text-emerald-400">#{c.user_id}</span>
  )},
  { key: 'name', header: 'שם', render: (c: DbConversation) => (
    <span className="font-medium text-[var(--ink)]">{c.user_name || '—'}</span>
  )},
  { key: 'phone', header: 'טלפון', render: (c: DbConversation) => (
    <span className="font-mono text-[var(--text-secondary)] text-sm">{c.user_phone}</span>
  )},
  { key: 'channel', header: 'ערוץ', render: (c: DbConversation) => (
    c.channel_type_snapshot
      ? <TagCell label={c.channel_type_snapshot} style="bg-[var(--acc)]/10 text-[var(--acc)]" />
      : <span className="text-[var(--text-muted)] text-xs">—</span>
  )},
  { key: 'updated', header: 'עודכן', render: (c: DbConversation) => <DateCell value={c.updated_at || null} withTime /> },
];

// ─── Messages ───────────────────────────────────────────
const MSG_TYPE_STYLES: Record<string, string> = {
  voice: 'bg-[var(--acc)]/10 text-[var(--acc)]',
  image: 'bg-cyan-500/10 text-cyan-400',
  media: 'bg-pink-500/10 text-pink-400',
  text: 'bg-[var(--glass-2)] text-[var(--text-secondary)]',
  manual: 'bg-orange-500/10 text-orange-400',
  external: 'bg-orange-500/15 text-orange-300',
  trigger_data: 'bg-amber-500/15 text-amber-300',
  escalation: 'bg-rose-500/15 text-rose-300',
  function: 'bg-[var(--acc2)]/15 text-[var(--acc2)]',
};

const MSG_TYPE_LABELS: Record<string, string> = {
  voice: '🎤 קולי',
  image: '🖼️ נכנסת',
  media: '📸 מדיה',
  text: '💬 טקסט',
  manual: '✋ ידני',
  external: '⚡ אוטומציה',
  trigger_data: '🧠 מידע לסוכן',
  escalation: '🚨 אסקלציה',
  function: 'פונקציה',
};

export const messageColumns = [
  { key: 'id', header: 'ID', render: (m: DbMessage) => (
    <span className="font-mono text-[var(--text-secondary)]">{m.id}</span>
  )},
  { key: 'conv', header: 'Conv', render: (m: DbMessage) => (
    <span className="text-[var(--acc)]">#{m.conversation_id}</span>
  )},
  { key: 'role', header: 'תפקיד', render: (m: DbMessage) => (
    <TagCell
      label={m.role === 'user' ? '👤 User' : '🤖 AI'}
      style={m.role === 'user' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--acc)]/10 text-[var(--acc)]'}
    />
  )},
  { key: 'type', header: 'סוג', render: (m: DbMessage) => {
    const type = m.message_type || 'text';
    return <TagCell label={MSG_TYPE_LABELS[type] || MSG_TYPE_LABELS.text} style={MSG_TYPE_STYLES[type] || MSG_TYPE_STYLES.text} />;
  }},
  { key: 'media', header: 'מדיה', render: (m: DbMessage) => (
    m.media_id
      ? <span className="text-pink-400 text-xs">#{m.media_id}</span>
      : <span className="text-[var(--text-muted)] text-xs">—</span>
  )},
  { 
    key: 'content', 
    header: 'תוכן', 
    render: (m: DbMessage) => (
      <span className="text-[var(--text-secondary)] text-sm">
        {(m.content || '').slice(0, 50)}{(m.content || '').length > 50 ? '...' : ''}
      </span>
    ), 
    className: 'max-w-[300px] truncate' 
  },
  { key: 'time', header: 'זמן', render: (m: DbMessage) => <DateCell value={m.created_at || null} withTime /> },
];

// ─── Appointments ───────────────────────────────────────
const APT_STATUS: Record<string, { style: string; label: string }> = {
  scheduled: { style: 'bg-emerald-500/10 text-emerald-400', label: 'מתוכנן' },
  cancelled: { style: 'bg-red-500/10 text-red-400', label: 'בוטל' },
  completed: { style: 'bg-[var(--acc)]/10 text-[var(--acc)]', label: 'הושלם' },
};

export const appointmentColumns = [
  { key: 'id', header: 'ID', render: (a: DbAppointment) => (
    <span className="font-mono text-[var(--text-secondary)]">{a.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (a: DbAppointment) => (
    <span className="text-[var(--acc)]">{a.agent_name || `#${a.agent_id}`}</span>
  )},
  { key: 'user', header: 'לקוח', render: (a: DbAppointment) => (
    <div>
      <div className="font-medium text-[var(--ink)]">{a.user_name || '—'}</div>
      <div className="text-xs text-[var(--text-secondary)]">{a.user_phone}</div>
    </div>
  )},
  { key: 'title', header: 'כותרת', render: (a: DbAppointment) => (
    <span className="text-[var(--ink)]">{a.title}</span>
  )},
  { key: 'time', header: 'זמן', render: (a: DbAppointment) => (
    <div className="text-sm">
      <div className="text-[var(--ink)]">
        {parseUTCDate(a.start_time)?.toLocaleDateString('he-IL') ?? '—'}
      </div>
      <div className="text-[var(--text-secondary)]">
        {parseUTCDate(a.start_time)?.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) ?? ''}
        {parseUTCDate(a.end_time) ? ` - ${parseUTCDate(a.end_time)!.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>
    </div>
  )},
  { key: 'status', header: 'סטטוס', render: (a: DbAppointment) => {
    const s = APT_STATUS[a.status] || APT_STATUS.scheduled;
    return <TagCell label={s.label} style={s.style} />;
  }},
  { key: 'google', header: 'Google', render: (a: DbAppointment) => (
    a.google_event_id 
      ? <span className="text-emerald-400 text-xs">מסונכרן</span>
      : <span className="text-[var(--text-muted)] text-xs">—</span>
  )},
];

// ─── Reminders ──────────────────────────────────────────
const REMINDER_STATUS: Record<string, { style: string; label: string }> = {
  pending: { style: 'bg-yellow-500/10 text-yellow-400', label: 'ממתין' },
  sent: { style: 'bg-emerald-500/10 text-emerald-400', label: 'נשלח' },
  failed: { style: 'bg-red-500/10 text-red-400', label: 'נכשל' },
  cancelled: { style: 'bg-[var(--glass-2)] text-[var(--text-secondary)]', label: 'בוטל' },
};

export const reminderColumns = [
  { key: 'id', header: 'ID', render: (r: DbReminder) => (
    <span className="font-mono text-[var(--text-secondary)]">{r.id}</span>
  )},
  { key: 'apt', header: 'פגישה', render: (r: DbReminder) => (
    <div>
      <div className="text-[var(--ink)]">{r.appointment_title || `#${r.appointment_id}`}</div>
      <div className="text-xs text-[var(--text-secondary)]">{r.agent_name}</div>
    </div>
  )},
  { key: 'user', header: 'לקוח', render: (r: DbReminder) => (
    <div>
      <div className="text-[var(--ink)]">{r.user_name || '—'}</div>
      <div className="text-xs text-[var(--text-secondary)]">{r.user_phone}</div>
    </div>
  )},
  { key: 'scheduled', header: 'מתוזמן ל', render: (r: DbReminder) => <DateCell value={r.scheduled_for || null} withTime /> },
  { key: 'status', header: 'סטטוס', render: (r: DbReminder) => {
    const s = REMINDER_STATUS[r.status] || REMINDER_STATUS.pending;
    return <TagCell label={s.label} style={s.style} />;
  }},
  { key: 'recipients', header: 'נמענים', render: (r: DbReminder) => (
    <div className="text-xs space-y-0.5">
      {r.send_to_customer && <span className="text-emerald-400">ללקוח</span>}
      {r.send_to_business && <span className="text-[var(--acc)] mr-2">לעסק ({r.channel})</span>}
    </div>
  )},
  { key: 'sent', header: 'נשלח ב', render: (r: DbReminder) => (
    parseUTCDate(r.sent_at)
      ? <span className="text-emerald-400 text-xs">{parseUTCDate(r.sent_at)!.toLocaleString('he-IL')}</span>
      : <span className="text-[var(--text-muted)] text-xs">—</span>
  )},
  { key: 'error', header: 'שגיאה', render: (r: DbReminder) => (
    r.error_message 
      ? <span className="text-red-400 text-xs" title={r.error_message}>{r.error_message.slice(0, 20)}...</span>
      : <span className="text-[var(--text-muted)] text-xs">—</span>
  )},
];

// ─── Summaries ──────────────────────────────────────────
const WEBHOOK_STATUS: Record<string, { style: string; label: string }> = {
  pending: { style: 'bg-yellow-500/10 text-yellow-400', label: 'ממתין' },
  sent: { style: 'bg-emerald-500/10 text-emerald-400', label: 'נשלח' },
  failed: { style: 'bg-red-500/10 text-red-400', label: 'נכשל' },
};

export const summaryColumns = [
  { key: 'id', header: 'ID', render: (s: DbSummary) => (
    <span className="font-mono text-[var(--text-secondary)]">{s.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (s: DbSummary) => (
    <span className="text-[var(--acc)]">{s.agent_name || `#${s.agent_id}`}</span>
  )},
  { key: 'user', header: 'לקוח', render: (s: DbSummary) => (
    <div>
      <div className="text-[var(--ink)]">{s.user_name || '—'}</div>
      <div className="text-xs text-[var(--text-secondary)]">{s.user_phone}</div>
    </div>
  )},
  { key: 'summary', header: 'סיכום', render: (s: DbSummary) => (
    <span className="text-[var(--text-secondary)] text-sm" title={s.summary_text}>
      {s.summary_text}
    </span>
  ), className: 'max-w-[300px] truncate' },
  { key: 'messages', header: 'הודעות', render: (s: DbSummary) => (
    <span className="text-[var(--text-secondary)]">{s.message_count}</span>
  )},
  { key: 'webhook', header: 'Webhook', render: (s: DbSummary) => {
    const ws = WEBHOOK_STATUS[s.webhook_status] || WEBHOOK_STATUS.pending;
    return (
      <div>
        <TagCell label={ws.label} style={ws.style} />
        {s.webhook_attempts > 0 && (
          <div className="text-xs text-[var(--text-muted)] mt-1">נסיונות: {s.webhook_attempts}</div>
        )}
      </div>
    );
  }},
  { key: 'error', header: 'שגיאה/ניסיון הבא', render: (s: DbSummary) => (
    <div>
      {s.webhook_last_error && (
        <span className="text-red-400 text-xs block" title={s.webhook_last_error}>
          {s.webhook_last_error.slice(0, 20)}...
        </span>
      )}
      {s.next_retry_at && s.webhook_status === 'pending' && (
        <span className="text-yellow-400 text-xs">
          ניסיון הבא: {parseUTCDate(s.next_retry_at)?.toLocaleTimeString('he-IL')}
        </span>
      )}
      {!s.webhook_last_error && !s.next_retry_at && (
        <span className="text-[var(--text-muted)] text-xs">—</span>
      )}
    </div>
  )},
  { key: 'created', header: 'נוצר', render: (s: DbSummary) => <DateCell value={s.created_at || null} withTime /> },
];

// ─── Media ──────────────────────────────────────────────
const MEDIA_STYLES = {
  image: { bg: 'bg-cyan-500/10 text-cyan-400', label: '🖼️ תמונה' },
  video: { bg: 'bg-[var(--acc)]/10 text-[var(--acc)]', label: '🎬 וידאו' },
  document: { bg: 'bg-amber-500/10 text-amber-400', label: '📄 קובץ' },
};

export const mediaColumns = [
  { key: 'id', header: 'ID', render: (m: DbMedia) => (
    <span className="font-mono text-[var(--text-secondary)]">{m.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (m: DbMedia) => (
    <span className="text-[var(--acc)]">{m.agent_name || `#${m.agent_id}`}</span>
  )},
  { key: 'type', header: 'סוג', render: (m: DbMedia) => {
    const style = MEDIA_STYLES[m.media_type] || MEDIA_STYLES.document;
    return <TagCell label={style.label} style={style.bg} />;
  }},
  { key: 'name', header: 'שם', render: (m: DbMedia) => (
    <span className="text-[var(--ink)] font-medium">{m.name}</span>
  )},
  { key: 'desc', header: 'תיאור', render: (m: DbMedia) => (
    <span className="text-[var(--text-secondary)] text-sm" title={m.description || ''}>
      {m.description ? (m.description.slice(0, 30) + (m.description.length > 30 ? '...' : '')) : '—'}
    </span>
  ), className: 'max-w-[150px] truncate' },
  { key: 'size', header: 'גודל', render: (m: DbMedia) => {
    const sizeKB = Math.round(m.file_size / 1024);
    const compressed = m.original_size && m.original_size > m.file_size;
    return (
      <div className="text-xs">
        <span className="text-[var(--text-secondary)]">{sizeKB} KB</span>
        {compressed && (
          <span className="text-emerald-400 mr-1">
            ({Math.round((1 - m.file_size / m.original_size!) * 100)}%-)
          </span>
        )}
      </div>
    );
  }},
  { key: 'mime', header: 'MIME', render: (m: DbMedia) => (
    <span className="text-[var(--text-muted)] text-xs font-mono">{m.mime_type || '—'}</span>
  )},
  { key: 'status', header: 'סטטוס', render: (m: DbMedia) => <StatusBadge active={m.is_active} /> },
  { key: 'preview', header: 'תצוגה', render: (m: DbMedia) => {
    const labels = { image: 'צפה', video: 'נגן', document: 'הורד' };
    return (
      <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-[var(--acc)] text-xs hover:underline">
        {labels[m.media_type] || 'פתח'}
      </a>
    );
  }},
  { key: 'created', header: 'נוצר', render: (m: DbMedia) => <DateCell value={m.created_at || null} /> },
];

// ─── Templates ──────────────────────────────────────────
const TEMPLATE_CATEGORY: Record<string, { style: string; label: string }> = {
  MARKETING: { style: 'bg-pink-500/10 text-pink-400', label: '📣 שיווקי' },
  UTILITY: { style: 'bg-[var(--acc)]/10 text-[var(--acc)]', label: '⚙️ שירותי' },
  AUTHENTICATION: { style: 'bg-emerald-500/10 text-emerald-400', label: '🔐 אימות' },
};

const TEMPLATE_STATUS: Record<string, { style: string; label: string }> = {
  APPROVED: { style: 'bg-emerald-500/10 text-emerald-400', label: '✓ מאושר' },
  PENDING: { style: 'bg-yellow-500/10 text-yellow-400', label: '⏳ ממתין' },
  REJECTED: { style: 'bg-red-500/10 text-red-400', label: '✕ נדחה' },
  PAUSED: { style: 'bg-[var(--glass-2)] text-[var(--text-secondary)]', label: '⏸ מושהה' },
};

export const templateColumns = [
  { key: 'id', header: 'ID', render: (t: DbTemplate) => (
    <span className="font-mono text-[var(--text-secondary)]">{t.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (t: DbTemplate) => (
    <span className="text-[var(--acc)]">{t.agent_name || `#${t.agent_id}`}</span>
  )},
  { key: 'name', header: 'שם', render: (t: DbTemplate) => (
    <code className="text-xs bg-[var(--glass-2)] px-2 py-1 rounded text-[var(--ink)]">{t.name}</code>
  )},
  { key: 'category', header: 'קטגוריה', render: (t: DbTemplate) => {
    const c = TEMPLATE_CATEGORY[t.category] || { style: '', label: t.category };
    return <TagCell label={c.label} style={c.style} />;
  }},
  { key: 'status', header: 'סטטוס', render: (t: DbTemplate) => {
    const s = TEMPLATE_STATUS[t.status] || { style: '', label: t.status };
    return <TagCell label={s.label} style={s.style} />;
  }},
  { key: 'language', header: 'שפה', render: (t: DbTemplate) => (
    <span className="text-[var(--text-secondary)] text-xs">{t.language}</span>
  )},
  { key: 'created', header: 'נוצר', render: (t: DbTemplate) => <DateCell value={t.created_at || null} /> },
];

// ─── Follow-ups ──────────────────────────────────────────
const FOLLOWUP_STATUS: Record<string, { style: string; label: string }> = {
  pending: { style: 'bg-yellow-500/10 text-yellow-400', label: '⏳ ממתין' },
  evaluating: { style: 'bg-[var(--acc)]/10 text-[var(--acc)]', label: '🤔 בהערכה' },
  sent: { style: 'bg-emerald-500/10 text-emerald-400', label: '✓ נשלח' },
  skipped: { style: 'bg-[var(--glass-2)] text-[var(--text-secondary)]', label: '⏭ דולג' },
  cancelled: { style: 'bg-red-500/10 text-red-400', label: '✕ בוטל' },
};

export const followupColumns = [
  { key: 'id', header: 'ID', render: (f: DbFollowup) => (
    <span className="font-mono text-[var(--text-secondary)]">{f.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (f: DbFollowup) => (
    <span className="text-[var(--acc)]">{f.agent_name || `#${f.agent_id}`}</span>
  )},
  { key: 'user', header: 'לקוח', render: (f: DbFollowup) => (
    <span className="text-[var(--ink)]">{f.user_name || f.user_phone || `#${f.user_id}`}</span>
  )},
  { key: 'number', header: 'שלב', render: (f: DbFollowup) => (
    <span className="text-[var(--text-secondary)] font-mono">{f.followup_number}</span>
  )},
  { key: 'instruction', header: 'הנחיה', render: (f: DbFollowup) => (
    <span className="text-[var(--text-secondary)] text-xs truncate max-w-[150px] block">{f.step_instruction || '—'}</span>
  )},
  { key: 'status', header: 'סטטוס', render: (f: DbFollowup) => {
    const s = FOLLOWUP_STATUS[f.status] || { style: '', label: f.status };
    return <TagCell label={s.label} style={s.style} />;
  }},
  { key: 'scheduled', header: 'מתוזמן', render: (f: DbFollowup) => <DateCell value={f.scheduled_for} withTime /> },
  { key: 'sent_at', header: 'נשלח', render: (f: DbFollowup) => <DateCell value={f.sent_at} withTime /> },
  { key: 'sent_via', header: 'ערוץ', render: (f: DbFollowup) => (
    <span className="text-[var(--text-secondary)] text-xs">{f.sent_via || '—'}</span>
  )},
  { key: 'content', header: 'תוכן', render: (f: DbFollowup) => (
    <span className="text-[var(--text-secondary)] text-xs truncate max-w-[200px] block">
      {f.content || f.template_name || '—'}
    </span>
  )},
  { key: 'reason', header: 'סיבה', render: (f: DbFollowup) => (
    <span className="text-[var(--text-secondary)] text-xs truncate max-w-[200px] block">{f.ai_reason || '—'}</span>
  )},
  { key: 'created', header: 'נוצר', render: (f: DbFollowup) => <DateCell value={f.created_at} /> },
];

// ─── Channels ────────────────────────────────────────────
export const channelColumns = [
  { key: 'id', header: 'ID', render: (c: DbChannel) => (
    <span className="font-mono text-[var(--text-secondary)]">{c.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (c: DbChannel) => (
    <span className="text-[var(--acc)]">{c.agent_name || `#${c.agent_id}`}</span>
  )},
  { key: 'type', header: 'סוג', render: (c: DbChannel) => (
    <TagCell label={c.channel_type} style="bg-[var(--acc)]/10 text-[var(--acc)]" />
  )},
  { key: 'account', header: 'חשבון', render: (c: DbChannel) => (
    <div className="text-sm">
      <div className="text-[var(--ink)]">{c.account_name || '—'}</div>
      <div className="text-xs text-[var(--text-secondary)] font-mono">{c.external_account_id}</div>
    </div>
  )},
  { key: 'status', header: 'סטטוס', render: (c: DbChannel) => <StatusBadge active={c.is_active} /> },
  { key: 'health', header: 'בריאות', render: (c: DbChannel) => {
    const h = c.health_status || 'unknown';
    const style = h === 'healthy' ? 'text-emerald-400' : h === 'error' ? 'text-red-400' : 'text-[var(--text-muted)]';
    return <span className={`text-xs ${style}`}>{h}</span>;
  }},
  { key: 'created', header: 'נוצר', render: (c: DbChannel) => <DateCell value={c.created_at} /> },
];

// ─── Channel Users ───────────────────────────────────────
export const channelUserColumns = [
  { key: 'id', header: 'ID', render: (cu: DbChannelUser) => (
    <span className="font-mono text-[var(--text-secondary)]">{cu.id}</span>
  )},
  { key: 'channel', header: 'ערוץ', render: (cu: DbChannelUser) => (
    <span className="text-[var(--acc)]">#{cu.channel_id}</span>
  )},
  { key: 'type', header: 'סוג', render: (cu: DbChannelUser) => (
    cu.channel_type
      ? <TagCell label={cu.channel_type} style="bg-[var(--acc)]/10 text-[var(--acc)]" />
      : <span className="text-[var(--text-muted)]">—</span>
  )},
  { key: 'external', header: 'External ID', render: (cu: DbChannelUser) => (
    <span className="font-mono text-[var(--text-secondary)] text-xs">{cu.external_id}</span>
  )},
  { key: 'name', header: 'שם', render: (cu: DbChannelUser) => (
    <span className="text-[var(--ink)]">{cu.display_name || '—'}</span>
  )},
  { key: 'bsuid', header: 'BSUID', render: (cu: DbChannelUser) => (
    <span className="font-mono text-[var(--text-secondary)] text-xs">{cu.bsuid || '—'}</span>
  )},
  { key: 'created', header: 'נוצר', render: (cu: DbChannelUser) => <DateCell value={cu.created_at} /> },
];
