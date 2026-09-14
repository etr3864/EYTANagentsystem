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
import { AgentAvatar } from './AgentAvatar';
import { ClosedPane } from './ClosedPane';
import { EntryForm } from './EntryForm';
import { Thread } from './Thread';
import { TryComposer } from './TryComposer';
import { useVisualViewportHeight } from './useVisualViewportHeight';

const GONE_COPY = 'מטעמי אבטחה הקישור פג תוקף, פנה למנהל התיק שלך לקבלת קישור חדש לבדיקה. בהצלחה!';

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

export function TryApp({ token }: { token: string }) {
  const frame = useVisualViewportHeight();
  const height = frame?.height ?? null;
  const offsetTop = frame?.offsetTop ?? 0;
  const keyboardOpen = frame?.keyboard ?? false;
  const [phase, setPhase] = useState<'boot' | 'gone' | 'entry' | 'chat'>('boot');
  const [session, setSession] = useState<TrySession | null>(null);
  const [messages, setMessages] = useState<TryBubble[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useRef(new Set<string>());

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

  async function enter(name: string, phone: string) {
    setBusy(true);
    setError(null);
    try {
      applySession(await tryEnter(token, name, phone));
    } catch (err) {
      if (isGone(err)) setPhase('gone');
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
      className="fixed left-0 right-0 z-50 flex justify-center md:items-center text-white overflow-hidden bg-[#08080c]"
      style={{ top: offsetTop, height: height ?? '100dvh' }}
    >
      <div
        className="try-shell w-full max-w-[420px] h-full md:h-[min(100%,820px)] md:my-auto flex flex-col overflow-hidden md:rounded-[42px_26px_38px_22px] md:border md:border-white/[0.1] md:shadow-[0_40px_90px_rgba(0,0,0,0.55)]"
        data-kbd={keyboardOpen ? 'true' : undefined}
      >
        <span className="try-liquid" aria-hidden>
          <i /><i /><i />
        </span>
        <div className="relative z-[1] flex flex-1 min-h-0 flex-col">
          {phase === 'boot' && (
            <div className="flex-1 grid place-items-center">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            </div>
          )}

          {phase === 'gone' && <ClosedPane message={error || GONE_COPY} />}

          {phase === 'entry' && (
            <EntryForm agentName={agentName} busy={busy} error={error} onSubmit={enter} />
          )}

          {phase === 'chat' && (
            <div className="relative flex-1 min-h-0">
              <header className={`try-chrome-head try-glass flex items-center gap-3 px-3 ${
                keyboardOpen ? 'h-11' : 'h-[56px]'
              }`}>
                <AgentAvatar name={agentName} size={keyboardOpen ? 32 : 40} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[16px] leading-tight tracking-tight truncate">{agentName}</div>
                  {locked && (
                    <p className="text-[12px] text-white/40 truncate">השיחה הסתיימה</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={resetChat}
                  className="try-pebble w-10 h-10 grid place-items-center text-white/55 hover:bg-white/[0.08] disabled:opacity-40"
                  aria-label="שיחה חדשה"
                  title="שיחה חדשה"
                >
                  <svg className="w-[18px] h-[18px] text-white/75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
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
              <div className="try-chrome-foot">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
