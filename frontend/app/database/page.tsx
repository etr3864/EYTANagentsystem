'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button, Card } from '@/components/ui';
import { DataTable } from '@/components/database';
import { 
  getAgents, deleteAgent,
  getUsers, deleteUser,
  getDbConversations, deleteConversation,
  getDbMessages, deleteDbMessage,
  getUsageStats,
  getDbAppointments, deleteDbAppointment,
  getDbReminders, deleteDbReminder,
  getDbSummaries, deleteDbSummary,
  getDbMedia, deleteDbMedia,
  getDbTemplates, deleteDbTemplate
} from '@/lib/api';
import type { Agent, User, DbConversation, DbMessage, UsageStats, DbAppointment, DbReminder, DbSummary, DbMedia, DbTemplate } from '@/lib/types';

type Tab = 'agents' | 'users' | 'conversations' | 'messages' | 'media' | 'templates' | 'appointments' | 'reminders' | 'summaries' | 'usage';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'conversations', label: 'Conversations', icon: '💬' },
  { id: 'messages', label: 'Messages', icon: '📝' },
  { id: 'media', label: 'Media', icon: '📸' },
  { id: 'templates', label: 'Templates', icon: '📋' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'reminders', label: 'Reminders', icon: '⏰' },
  { id: 'summaries', label: 'Summaries', icon: '📋' },
  { id: 'usage', label: 'Usage', icon: '📊' },
];

const agentColumns = [
  { key: 'id', header: 'ID', render: (a: Agent) => (
    <span className="font-mono text-slate-400">{a.id}</span>
  )},
  { key: 'name', header: 'שם', render: (a: Agent) => (
    <span className="font-medium text-white">{a.name}</span>
  )},
  { key: 'model', header: 'Model', render: (a: Agent) => (
    <span className="text-xs bg-slate-700/50 px-2 py-1 rounded">
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
          <div className={hasTokens ? 'text-emerald-400' : 'text-slate-500'}>
            {hasTokens ? '✓ מחובר' : '✗ לא מחובר'}
          </div>
          {hasTokens ? (
            <>
              <div className="text-slate-400">{activeDays}/7 ימים פעילים</div>
              {webhook ? <div className="text-blue-400">webhook ✓</div> : null}
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
        <span title={a.appointment_prompt} className="text-slate-400 text-xs">
          {a.appointment_prompt.slice(0, 30)}...
        </span>
      ) : (
        <span className="text-slate-500 text-xs">—</span>
      )
    ),
    className: 'max-w-[150px] truncate'
  },
  { 
    key: 'status', 
    header: 'סטטוס', 
    render: (a: Agent) => (
      <span className={`
        inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full
        ${a.is_active 
          ? 'bg-emerald-500/10 text-emerald-400' 
          : 'bg-slate-600/50 text-slate-400'
        }
      `}>
        <span className={`w-1.5 h-1.5 rounded-full ${a.is_active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        {a.is_active ? 'פעיל' : 'מושבת'}
      </span>
    )
  },
];

const userColumns = [
  { key: 'id', header: 'ID', render: (u: User) => (
    <span className="font-mono text-slate-400">{u.id}</span>
  )},
  { key: 'name', header: 'שם', render: (u: User) => (
    <span className="font-medium text-white">{u.name || '—'}</span>
  )},
  { key: 'phone', header: 'טלפון', render: (u: User) => (
    <span className="font-mono text-slate-400 text-sm">{u.phone}</span>
  )},
  { 
    key: 'gender', 
    header: 'מגדר', 
    render: (u: User) => {
      if (u.gender === 'male') return <span className="text-blue-400">👨 זכר</span>;
      if (u.gender === 'female') return <span className="text-pink-400">👩 נקבה</span>;
      return <span className="text-slate-500">—</span>;
    }
  },
  { 
    key: 'metadata', 
    header: 'מידע נוסף', 
    render: (u: User) => {
      const meta = u.metadata;
      if (!meta) return <span className="text-slate-500">—</span>;
      const parts = [];
      if (meta.business_type) parts.push(meta.business_type as string);
      if (meta.notes) parts.push(meta.notes as string);
      return parts.length > 0 ? (
        <span className="text-slate-400 text-sm">{parts.join(' • ')}</span>
      ) : <span className="text-slate-500">—</span>;
    }
  },
  { 
    key: 'updated', 
    header: 'עודכן', 
    render: (u: User) => (
      <span className="text-slate-500 text-xs">
        {u.updated_at ? new Date(u.updated_at).toLocaleDateString('he-IL') : '—'}
      </span>
    )
  },
];

const conversationColumns = [
  { key: 'id', header: 'ID', render: (c: DbConversation) => (
    <span className="font-mono text-slate-400">{c.id}</span>
  )},
  { key: 'agent', header: 'Agent', render: (c: DbConversation) => (
    <span className="text-blue-400">#{c.agent_id}</span>
  )},
  { key: 'user', header: 'User', render: (c: DbConversation) => (
    <span className="text-emerald-400">#{c.user_id}</span>
  )},
  { key: 'name', header: 'שם', render: (c: DbConversation) => (
    <span className="font-medium text-white">{c.user_name || '—'}</span>
  )},
  { key: 'phone', header: 'טלפון', render: (c: DbConversation) => (
    <span className="font-mono text-slate-400 text-sm">{c.user_phone}</span>
  )},
  { 
    key: 'updated', 
    header: 'עודכן', 
    render: (c: DbConversation) => (
      <span className="text-slate-500 text-xs">
        {c.updated_at ? new Date(c.updated_at).toLocaleString('he-IL') : '—'}
      </span>
    )
  },
];

const messageColumns = [
  { key: 'id', header: 'ID', render: (m: DbMessage) => (
    <span className="font-mono text-slate-400">{m.id}</span>
  )},
  { key: 'conv', header: 'Conv', render: (m: DbMessage) => (
    <span className="text-purple-400">#{m.conversation_id}</span>
  )},
  { key: 'role', header: 'תפקיד', render: (m: DbMessage) => (
    <span className={`
      text-xs px-2 py-1 rounded
      ${m.role === 'user' 
        ? 'bg-emerald-500/10 text-emerald-400' 
        : 'bg-blue-500/10 text-blue-400'
      }
    `}>
      {m.role === 'user' ? '👤 User' : '🤖 AI'}
    </span>
  )},
  { key: 'type', header: 'סוג', render: (m: DbMessage) => {
    const styles: Record<string, string> = {
      voice: 'bg-purple-500/10 text-purple-400',
      image: 'bg-cyan-500/10 text-cyan-400',
      media: 'bg-pink-500/10 text-pink-400',
      text: 'bg-slate-500/10 text-slate-400',
      manual: 'bg-orange-500/10 text-orange-400'
    };
    const labels: Record<string, string> = {
      voice: '🎤 קולי',
      image: '🖼️ נכנסת',
      media: '📸 מדיה',
      text: '💬 טקסט',
      manual: '✋ ידני'
    };
    const type = m.message_type || 'text';
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[type] || styles.text}`}>
        {labels[type] || labels.text}
      </span>
    );
  }},
  { key: 'media', header: 'מדיה', render: (m: DbMessage) => (
    m.media_id ? (
      <span className="text-pink-400 text-xs">#{m.media_id}</span>
    ) : (
      <span className="text-slate-500 text-xs">—</span>
    )
  )},
  { 
    key: 'content', 
    header: 'תוכן', 
    render: (m: DbMessage) => (
      <span className="text-slate-300 text-sm">
        {m.content.slice(0, 50)}{m.content.length > 50 ? '...' : ''}
      </span>
    ), 
    className: 'max-w-[300px] truncate' 
  },
  { 
    key: 'time', 
    header: 'זמן', 
    render: (m: DbMessage) => (
      <span className="text-slate-500 text-xs">
        {m.created_at ? new Date(m.created_at).toLocaleString('he-IL') : '—'}
      </span>
    )
  },
];

const appointmentColumns = [
  { key: 'id', header: 'ID', render: (a: DbAppointment) => (
    <span className="font-mono text-slate-400">{a.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (a: DbAppointment) => (
    <span className="text-blue-400">{a.agent_name || `#${a.agent_id}`}</span>
  )},
  { key: 'user', header: 'לקוח', render: (a: DbAppointment) => (
    <div>
      <div className="font-medium text-white">{a.user_name || '—'}</div>
      <div className="text-xs text-slate-400">{a.user_phone}</div>
    </div>
  )},
  { key: 'title', header: 'כותרת', render: (a: DbAppointment) => (
    <span className="text-white">{a.title}</span>
  )},
  { key: 'time', header: 'זמן', render: (a: DbAppointment) => (
    <div className="text-sm">
      <div className="text-white">
        {a.start_time ? new Date(a.start_time).toLocaleDateString('he-IL') : '—'}
      </div>
      <div className="text-slate-400">
        {a.start_time ? new Date(a.start_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''}
        {a.end_time ? ` - ${new Date(a.end_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>
    </div>
  )},
  { key: 'status', header: 'סטטוס', render: (a: DbAppointment) => {
    const styles: Record<string, string> = {
      scheduled: 'bg-emerald-500/10 text-emerald-400',
      cancelled: 'bg-red-500/10 text-red-400',
      completed: 'bg-blue-500/10 text-blue-400',
    };
    const labels: Record<string, string> = {
      scheduled: 'מתוכנן',
      cancelled: 'בוטל',
      completed: 'הושלם',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[a.status] || styles.scheduled}`}>
        {labels[a.status] || a.status}
      </span>
    );
  }},
  { key: 'google', header: 'Google', render: (a: DbAppointment) => (
    a.google_event_id 
      ? <span className="text-emerald-400 text-xs">מסונכרן</span>
      : <span className="text-slate-500 text-xs">—</span>
  )},
];

const reminderColumns = [
  { key: 'id', header: 'ID', render: (r: DbReminder) => (
    <span className="font-mono text-slate-400">{r.id}</span>
  )},
  { key: 'apt', header: 'פגישה', render: (r: DbReminder) => (
    <div>
      <div className="text-white">{r.appointment_title || `#${r.appointment_id}`}</div>
      <div className="text-xs text-slate-400">{r.agent_name}</div>
    </div>
  )},
  { key: 'user', header: 'לקוח', render: (r: DbReminder) => (
    <div>
      <div className="text-white">{r.user_name || '—'}</div>
      <div className="text-xs text-slate-400">{r.user_phone}</div>
    </div>
  )},
  { key: 'scheduled', header: 'מתוזמן ל', render: (r: DbReminder) => (
    <span className="text-slate-300 text-sm">
      {r.scheduled_for ? new Date(r.scheduled_for).toLocaleString('he-IL') : '—'}
    </span>
  )},
  { key: 'status', header: 'סטטוס', render: (r: DbReminder) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-400',
      sent: 'bg-emerald-500/10 text-emerald-400',
      failed: 'bg-red-500/10 text-red-400',
      cancelled: 'bg-slate-500/10 text-slate-400',
    };
    const labels: Record<string, string> = {
      pending: 'ממתין',
      sent: 'נשלח',
      failed: 'נכשל',
      cancelled: 'בוטל',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[r.status] || styles.pending}`}>
        {labels[r.status] || r.status}
      </span>
    );
  }},
  { key: 'recipients', header: 'נמענים', render: (r: DbReminder) => (
    <div className="text-xs space-y-0.5">
      {r.send_to_customer && <span className="text-emerald-400">ללקוח</span>}
      {r.send_to_business && <span className="text-blue-400 mr-2">לעסק ({r.channel})</span>}
    </div>
  )},
  { key: 'sent', header: 'נשלח ב', render: (r: DbReminder) => (
    r.sent_at 
      ? <span className="text-emerald-400 text-xs">{new Date(r.sent_at).toLocaleString('he-IL')}</span>
      : <span className="text-slate-500 text-xs">—</span>
  )},
  { key: 'error', header: 'שגיאה', render: (r: DbReminder) => (
    r.error_message 
      ? <span className="text-red-400 text-xs" title={r.error_message}>{r.error_message.slice(0, 20)}...</span>
      : <span className="text-slate-500 text-xs">—</span>
  )},
];

const summaryColumns = [
  { key: 'id', header: 'ID', render: (s: DbSummary) => (
    <span className="font-mono text-slate-400">{s.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (s: DbSummary) => (
    <span className="text-blue-400">{s.agent_name || `#${s.agent_id}`}</span>
  )},
  { key: 'user', header: 'לקוח', render: (s: DbSummary) => (
    <div>
      <div className="text-white">{s.user_name || '—'}</div>
      <div className="text-xs text-slate-400">{s.user_phone}</div>
    </div>
  )},
  { key: 'summary', header: 'סיכום', render: (s: DbSummary) => (
    <span className="text-slate-300 text-sm" title={s.summary_text}>
      {s.summary_text}
    </span>
  ), className: 'max-w-[300px] truncate' },
  { key: 'messages', header: 'הודעות', render: (s: DbSummary) => (
    <span className="text-slate-400">{s.message_count}</span>
  )},
  { key: 'webhook', header: 'Webhook', render: (s: DbSummary) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-400',
      sent: 'bg-emerald-500/10 text-emerald-400',
      failed: 'bg-red-500/10 text-red-400',
    };
    const labels: Record<string, string> = {
      pending: 'ממתין',
      sent: 'נשלח',
      failed: 'נכשל',
    };
    return (
      <div>
        <span className={`text-xs px-2 py-1 rounded ${styles[s.webhook_status] || styles.pending}`}>
          {labels[s.webhook_status] || s.webhook_status}
        </span>
        {s.webhook_attempts > 0 && (
          <div className="text-xs text-slate-500 mt-1">נסיונות: {s.webhook_attempts}</div>
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
          ניסיון הבא: {new Date(s.next_retry_at).toLocaleTimeString('he-IL')}
        </span>
      )}
      {!s.webhook_last_error && !s.next_retry_at && (
        <span className="text-slate-500 text-xs">—</span>
      )}
    </div>
  )},
  { key: 'created', header: 'נוצר', render: (s: DbSummary) => (
    <span className="text-slate-500 text-xs">
      {s.created_at ? new Date(s.created_at).toLocaleString('he-IL') : '—'}
    </span>
  )},
];

const usageColumns = [
  { key: 'agent', header: 'סוכן', render: (u: UsageStats) => (
    <span className="font-medium text-white">{u.agent_name || `#${u.agent_id}`}</span>
  )},
  { key: 'model', header: 'מודל', render: (u: UsageStats) => (
    <span className="text-xs bg-slate-700/50 px-2 py-1 rounded">
      {u.model.split('-').slice(0, 2).join(' ')}
    </span>
  )},
  { key: 'input', header: 'Input', render: (u: UsageStats) => (
    <span className="font-mono text-emerald-400">{u.input_tokens.toLocaleString()}</span>
  )},
  { key: 'output', header: 'Output', render: (u: UsageStats) => (
    <span className="font-mono text-blue-400">{u.output_tokens.toLocaleString()}</span>
  )},
  { key: 'cache', header: 'Cache', render: (u: UsageStats) => (
    <div className="text-xs text-slate-400">
      <div>📖 {u.cache_read_tokens.toLocaleString()}</div>
      <div>✍️ {u.cache_creation_tokens.toLocaleString()}</div>
    </div>
  )},
  { key: 'total', header: 'סה״כ', render: (u: UsageStats) => (
    <span className="font-mono text-yellow-400 font-medium">
      {(u.input_tokens + u.output_tokens).toLocaleString()}
    </span>
  )},
];

const mediaColumns = [
  { key: 'id', header: 'ID', render: (m: DbMedia) => (
    <span className="font-mono text-slate-400">{m.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (m: DbMedia) => (
    <span className="text-blue-400">{m.agent_name || `#${m.agent_id}`}</span>
  )},
  { key: 'type', header: 'סוג', render: (m: DbMedia) => {
    const styles = {
      image: { bg: 'bg-cyan-500/10 text-cyan-400', label: '🖼️ תמונה' },
      video: { bg: 'bg-purple-500/10 text-purple-400', label: '🎬 וידאו' },
      document: { bg: 'bg-amber-500/10 text-amber-400', label: '📄 קובץ' }
    };
    const style = styles[m.media_type] || styles.document;
    return (
      <span className={`text-xs px-2 py-1 rounded ${style.bg}`}>
        {style.label}
      </span>
    );
  }},
  { key: 'name', header: 'שם', render: (m: DbMedia) => (
    <span className="text-white font-medium">{m.name}</span>
  )},
  { key: 'desc', header: 'תיאור', render: (m: DbMedia) => (
    <span className="text-slate-400 text-sm" title={m.description || ''}>
      {m.description ? (m.description.slice(0, 30) + (m.description.length > 30 ? '...' : '')) : '—'}
    </span>
  ), className: 'max-w-[150px] truncate' },
  { key: 'size', header: 'גודל', render: (m: DbMedia) => {
    const sizeKB = Math.round(m.file_size / 1024);
    const compressed = m.original_size && m.original_size > m.file_size;
    return (
      <div className="text-xs">
        <span className="text-slate-300">{sizeKB} KB</span>
        {compressed && (
          <span className="text-emerald-400 mr-1">
            ({Math.round((1 - m.file_size / m.original_size!) * 100)}%-)
          </span>
        )}
      </div>
    );
  }},
  { key: 'mime', header: 'MIME', render: (m: DbMedia) => (
    <span className="text-slate-500 text-xs font-mono">{m.mime_type || '—'}</span>
  )},
  { key: 'status', header: 'סטטוס', render: (m: DbMedia) => (
    <span className={`text-xs px-2 py-1 rounded ${m.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
      {m.is_active ? 'פעיל' : 'מושבת'}
    </span>
  )},
  { key: 'preview', header: 'תצוגה', render: (m: DbMedia) => {
    const labels = { image: 'צפה', video: 'נגן', document: 'הורד' };
    return (
      <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs hover:underline">
        {labels[m.media_type] || 'פתח'}
      </a>
    );
  }},
  { key: 'created', header: 'נוצר', render: (m: DbMedia) => (
    <span className="text-slate-500 text-xs">
      {m.created_at ? new Date(m.created_at).toLocaleDateString('he-IL') : '—'}
    </span>
  )},
];

const templateColumns = [
  { key: 'id', header: 'ID', render: (t: DbTemplate) => (
    <span className="font-mono text-slate-400">{t.id}</span>
  )},
  { key: 'agent', header: 'סוכן', render: (t: DbTemplate) => (
    <span className="text-blue-400">{t.agent_name || `#${t.agent_id}`}</span>
  )},
  { key: 'name', header: 'שם', render: (t: DbTemplate) => (
    <code className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-200">{t.name}</code>
  )},
  { key: 'category', header: 'קטגוריה', render: (t: DbTemplate) => {
    const styles: Record<string, string> = {
      MARKETING: 'bg-pink-500/10 text-pink-400',
      UTILITY: 'bg-blue-500/10 text-blue-400',
      AUTHENTICATION: 'bg-emerald-500/10 text-emerald-400',
    };
    const labels: Record<string, string> = { MARKETING: '📣 שיווקי', UTILITY: '⚙️ שירותי', AUTHENTICATION: '🔐 אימות' };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[t.category] || ''}`}>
        {labels[t.category] || t.category}
      </span>
    );
  }},
  { key: 'status', header: 'סטטוס', render: (t: DbTemplate) => {
    const styles: Record<string, string> = {
      APPROVED: 'bg-emerald-500/10 text-emerald-400',
      PENDING: 'bg-yellow-500/10 text-yellow-400',
      REJECTED: 'bg-red-500/10 text-red-400',
      PAUSED: 'bg-slate-500/10 text-slate-400',
    };
    const labels: Record<string, string> = { APPROVED: '✓ מאושר', PENDING: '⏳ ממתין', REJECTED: '✕ נדחה', PAUSED: '⏸ מושהה' };
    return (
      <span className={`text-xs px-2 py-1 rounded ${styles[t.status] || ''}`}>
        {labels[t.status] || t.status}
      </span>
    );
  }},
  { key: 'language', header: 'שפה', render: (t: DbTemplate) => (
    <span className="text-slate-400 text-xs">{t.language}</span>
  )},
  { key: 'created', header: 'נוצר', render: (t: DbTemplate) => (
    <span className="text-slate-500 text-xs">
      {t.created_at ? new Date(t.created_at).toLocaleDateString('he-IL') : '—'}
    </span>
  )},
];

export default function DatabasePage() {
  const [tab, setTab] = useState<Tab>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [conversations, setConversations] = useState<DbConversation[]>([]);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [media, setMedia] = useState<DbMedia[]>([]);
  const [dbTemplates, setDbTemplates] = useState<DbTemplate[]>([]);
  const [appointments, setAppointments] = useState<DbAppointment[]>([]);
  const [reminders, setReminders] = useState<DbReminder[]>([]);
  const [summaries, setSummaries] = useState<DbSummary[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tab]);

  async function loadData() {
    setLoading(true);
    setSelected(new Set());
    try {
      if (tab === 'agents') setAgents(await getAgents());
      else if (tab === 'users') setUsers(await getUsers());
      else if (tab === 'conversations') setConversations(await getDbConversations());
      else if (tab === 'messages') setMessages(await getDbMessages());
      else if (tab === 'media') setMedia(await getDbMedia());
      else if (tab === 'templates') setDbTemplates(await getDbTemplates());
      else if (tab === 'appointments') setAppointments(await getDbAppointments());
      else if (tab === 'reminders') setReminders(await getDbReminders());
      else if (tab === 'summaries') setSummaries(await getDbSummaries());
      else if (tab === 'usage') setUsageStats(await getUsageStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!confirm(`למחוק ${selected.size} רשומות?`)) return;
    
    try {
      for (const id of selected) {
        if (tab === 'agents') await deleteAgent(id);
        else if (tab === 'users') await deleteUser(id);
        else if (tab === 'conversations') await deleteConversation(id);
        else if (tab === 'messages') await deleteDbMessage(id);
        else if (tab === 'media') await deleteDbMedia(id);
        else if (tab === 'templates') await deleteDbTemplate(id);
        else if (tab === 'appointments') await deleteDbAppointment(id);
        else if (tab === 'reminders') await deleteDbReminder(id);
        else if (tab === 'summaries') await deleteDbSummary(id);
      }
      loadData();
    } catch (e) {
      console.error(e);
    }
  }

  function getCount() {
    if (tab === 'agents') return agents.length;
    if (tab === 'users') return users.length;
    if (tab === 'conversations') return conversations.length;
    if (tab === 'messages') return messages.length;
    if (tab === 'media') return media.length;
    if (tab === 'templates') return dbTemplates.length;
    if (tab === 'appointments') return appointments.length;
    if (tab === 'reminders') return reminders.length;
    if (tab === 'summaries') return summaries.length;
    if (tab === 'usage') return usageStats.length;
    return 0;
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowRightIcon />
                  חזרה
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-700" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xl">
                  🗄️
                </div>
                <div>
                  <h1 className="font-semibold text-white">Database</h1>
                  <p className="text-xs text-slate-400">ניהול נתונים</p>
                </div>
              </div>
            </div>

            {/* Delete Button */}
            {selected.size > 0 && (
              <Button 
                variant="danger" 
                size="sm"
                onClick={handleDelete}
              >
                <TrashIcon />
                מחק {selected.size} נבחרים
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`
                  px-4 py-3 text-sm font-medium
                  border-b-2 transition-all duration-200
                  ${tab === t.id 
                    ? 'border-blue-500 text-blue-400' 
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-600'
                  }
                `}
              >
                <span className="ml-2">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            {getCount()} רשומות
          </div>
          <button 
            onClick={loadData} 
            className="text-sm text-slate-400 hover:text-white flex items-center gap-1"
          >
            <RefreshIcon />
            רענן
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <Card className="py-12">
            <div className="flex justify-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            {tab === 'agents' && (
              <DataTable data={agents} columns={agentColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'users' && (
              <DataTable data={users} columns={userColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'conversations' && (
              <DataTable data={conversations} columns={conversationColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'messages' && (
              <DataTable data={messages} columns={messageColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'media' && (
              <DataTable data={media} columns={mediaColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'templates' && (
              <DataTable data={dbTemplates} columns={templateColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'appointments' && (
              <DataTable data={appointments} columns={appointmentColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'reminders' && (
              <DataTable data={reminders} columns={reminderColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'summaries' && (
              <DataTable data={summaries} columns={summaryColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
            {tab === 'usage' && (
              <DataTable data={usageStats} columns={usageColumns} selected={selected} onToggleSelect={toggleSelect} />
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
