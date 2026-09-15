'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  tryBootstrap,
  tryEnter,
  tryEventsUrl,
  tryReset,
  trySend,
  trySendMedia,
  type TryBubble,
  type TrySession,
} from '@/lib/api/try';
import { Atmosphere } from './Atmosphere';
import { ClosedPane } from './ClosedPane';
import { Connecting } from './Connecting';
import { EntryForm } from './EntryForm';
import { Orb } from './Orb';
import { Thread } from './Thread';
import { TryComposer } from './TryComposer';
import { useVisualViewportHeight } from './useVisualViewportHeight';

const GONE_COPY = 'מטעמי אבטחה הקישור פג תוקף, פנה למנהל התיק שלך לקבלת קישור חדש לבדיקה. בהצלחה!';
const THEME_KEY = 'try-theme';

function isGone(err: unknown) {
  return Boolean(err && typeof err === 'object' && 'gone' in err);
}

function fileType(file: File): TryBubble['message_type'] {
  const mime = file.type || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'voice';
  return 'document';
}

function ThemeToggle({
  theme,
  onToggle,
  labeled = false,
}: {
  theme: 'dark' | 'light';
  onToggle: () => void;
  labeled?: boolean;
}) {
  const label = theme === 'light' ? 'בהיר' : 'כהה';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={labeled
        ? 'try-chip relative flex items-center gap-2 rounded-full py-2 px-4 text-[12px]'
        : 'try-icon try-header-theme relative'}
      aria-label={label}
    >
      {theme === 'light' ? <SunMark /> : <MoonMark />}
      {labeled ? label : null}
    </button>
  );
}

function MoonMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />
    </svg>
  );
}

function SunMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
    </svg>
  );
}

export function TryApp({ token }: { token: string }) {
  const frame = useVisualViewportHeight();
  const height = frame?.height ?? null;
  const offsetTop = frame?.offsetTop ?? 0;
  const keyboardOpen = frame?.keyboard ?? false;
  const [phase, setPhase] = useState<'boot' | 'gone' | 'entry' | 'connecting' | 'chat'>('boot');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [session, setSession] = useState<TrySession | null>(null);
  const [messages, setMessages] = useState<TryBubble[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const ids = useRef(new Set<string>());

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  const applySession = useCallback((next: TrySession) => {
    setSession(next);
    setMessages(next.messages || []);
    ids.current = new Set((next.messages || []).map((m) => String(m.id)));
    setStatus(null);
    setTyping(false);
    if (next.needs_profile) setPhase('entry');
    else setPhase('chat');
  }, []);

  useEffect(() => {
    let live = true;
    tryBootstrap(token)
      .then((data) => {
        if (!live) return;
        applySession(data);
      })
      .catch((err) => {
        if (!live) return;
        setPhase('gone');
        setError(err instanceof Error ? err.message : GONE_COPY);
      });
    return () => { live = false; };
  }, [token, applySession]);

  useEffect(() => {
    if (phase !== 'chat' || session?.closed) return;
    const src = new EventSource(tryEventsUrl(token), { withCredentials: true });
    src.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          type?: string;
          status?: string | null;
          message?: TryBubble;
          error?: string;
        };
        if (payload.type === 'typing' || payload.status === 'מקליד') {
          setTyping(true);
          setStatus(null);
          return;
        }
        if (payload.type === 'status') {
          setStatus(payload.status ?? null);
          setTyping(Boolean(payload.status));
          return;
        }
        if (payload.type === 'error') {
          setStatus(null);
          setTyping(false);
          return;
        }
        if ((payload.type === 'message' || payload.type === 'media') && payload.message) {
          const row = payload.message;
          const key = String(row.id ?? `${row.created_at}-${row.content}`);
          setStatus(null);
          setTyping(false);
          if (ids.current.has(key)) return;
          ids.current.add(key);
          setMessages((prev) => [...prev, row]);
        }
      } catch {
        /* ignore malformed */
      }
    };
    src.onerror = () => {
      /* EventSource reconnects */
    };
    return () => src.close();
  }, [phase, token, session?.closed]);

  async function enter() {
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (!nextName || !nextPhone) return;
    setBusy(true);
    setError(null);
    setPhase('connecting');
    try {
      applySession(await tryEnter(token, nextName, nextPhone));
    } catch (err) {
      if (isGone(err)) setPhase('gone');
      else setPhase('entry');
      setError(err instanceof Error ? err.message : 'לא ניתן להיכנס');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || session?.closed) return;
    const messageId = crypto.randomUUID();
    const optimistic: TryBubble = {
      id: messageId,
      role: 'user',
      content: text,
      reply_to: replyTo,
      created_at: new Date().toISOString(),
    };
    ids.current.add(messageId);
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setReplyTo(null);
    setTyping(true);
    try {
      const res = await trySend(token, text, replyTo, messageId);
      if ('closed' in res && res.closed) {
        applySession(res);
        setStatus(null);
        setTyping(false);
      }
    } catch (err) {
      if (isGone(err)) setPhase('gone');
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setDraft(text);
      setTyping(false);
    }
  }

  async function sendFile(file: File, caption: string) {
    if (session?.closed) return;
    const messageId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);
    const optimistic: TryBubble = {
      id: messageId,
      role: 'user',
      content: caption,
      message_type: fileType(file),
      media_url: localUrl,
      reply_to: replyTo,
      created_at: new Date().toISOString(),
    };
    const quoted = replyTo;
    ids.current.add(messageId);
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setReplyTo(null);
    setTyping(true);
    try {
      const res = await trySendMedia(token, file, caption, quoted, messageId);
      if ('closed' in res && res.closed) {
        applySession(res);
        setStatus(null);
        setTyping(false);
        return;
      }
      if ('message' in res && res.message?.media_url) {
        setMessages((prev) => prev.map((m) => (
          m.id === messageId
            ? { ...res.message!, id: messageId, created_at: res.message!.created_at || m.created_at }
            : m
        )));
        URL.revokeObjectURL(localUrl);
      }
    } catch (err) {
      if (isGone(err)) setPhase('gone');
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      URL.revokeObjectURL(localUrl);
      setTyping(false);
    }
  }

  async function sendVoice(blob: Blob) {
    const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' });
    await sendFile(file, '');
  }

  async function resetChat() {
    try {
      applySession(await tryReset(token));
      setStatus(null);
      setTyping(false);
    } catch (err) {
      if (isGone(err)) setPhase('gone');
    }
  }

  const agentName = session?.agent_name || 'שיחה';
  const locked = Boolean(session?.closed);

  return (
    <div
      className="try-root" dir="rtl"
      data-theme={theme}
      style={{ top: offsetTop, height: height ?? '100dvh' }}
    >
      <Atmosphere />
      {phase !== 'chat' && (
        <div className="relative z-[1] flex justify-end px-5 pt-[max(12px,env(safe-area-inset-top))] max-w-[1080px] w-full mx-auto">
          <ThemeToggle theme={theme} onToggle={toggleTheme} labeled />
        </div>
      )}
      <div className={`try-stage ${phase === 'chat' ? 'px-[clamp(12px,4vw,16px)] pt-[max(8px,env(safe-area-inset-top))]' : ''}`}>
        {phase === 'boot' && <Connecting title="פותח ערוץ" />}
        {phase === 'connecting' && <Connecting title="פותח ערוץ" live />}
        {phase === 'gone' && <ClosedPane message={error || GONE_COPY} />}
        {phase === 'entry' && (
          <EntryForm
            agentName={agentName}
            name={name}
            phone={phone}
            busy={busy}
            error={error}
            onName={setName}
            onPhone={setPhone}
            onSubmit={enter}
          />
        )}
        {phase === 'chat' && (
          <>
            <header className={`try-glass try-header relative shrink-0 flex items-center overflow-hidden${keyboardOpen ? ' is-keys' : ''}`}>
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]" aria-hidden>
                <div
                  className="absolute inset-0"
                  style={{ background: 'radial-gradient(120% 140% at 12% -20%, rgba(255,255,255,0.14), transparent 55%)' }}
                />
                <div
                  className="absolute w-[70%] h-[280%] -top-[90%] left-[5%]"
                  style={{
                    background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.16), transparent 58%)',
                    animation: 'try-inner 18s ease-in-out infinite',
                  }}
                />
              </div>
              <Orb className="try-header-orb" />
              <div className="relative min-w-0 flex-1">
                <div className="try-header-name truncate">{agentName}</div>
                {locked && <p className="text-[11px] text-[color:var(--ink-faint)] truncate">השיחה הסתיימה</p>}
              </div>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <button
                type="button"
                disabled={locked}
                onClick={resetChat}
                className="relative try-chip try-header-reset rounded-full disabled:opacity-40"
              >
                שיחה חדשה
              </button>
            </header>
            <Thread
              messages={messages}
              closedMessage={locked ? (session?.closed_message || GONE_COPY) : null}
              onReply={setReplyTo}
              viewportHeight={height}
              typing={typing}
              activity={status}
            />
            <TryComposer
              value={draft}
              onChange={setDraft}
              onSend={send}
              onSendFile={sendFile}
              onSendVoice={sendVoice}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              locked={locked}
              keyboardOpen={keyboardOpen}
            />
            {!keyboardOpen && (
              <div className="text-center mt-3 mb-1 text-[11px] text-[color:var(--ink-faint)] tracking-[0.1em]">
                מופעל על ידי OPTIVE
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
