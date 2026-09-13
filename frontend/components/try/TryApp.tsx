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
  const height = useVisualViewportHeight();
  const [phase, setPhase] = useState<'boot' | 'gone' | 'entry' | 'chat'>('boot');
  const [session, setSession] = useState<TrySession | null>(null);
  const [messages, setMessages] = useState<TryBubble[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useRef(new Set<string>());

  const applySession = useCallback((next: TrySession) => {
    setSession(next);
    setMessages(next.messages || []);
    ids.current = new Set((next.messages || []).map((m) => String(m.id)));
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
        setPhase(isGone(err) ? 'gone' : 'gone');
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
        if (payload.type === 'status' || payload.type === 'typing') {
          setStatus(payload.status || (payload.type === 'typing' ? 'מקליד' : null));
          return;
        }
        if (payload.type === 'error') {
          setStatus(null);
          return;
        }
        if ((payload.type === 'message' || payload.type === 'media') && payload.message) {
          const row = payload.message;
          const key = String(row.id ?? `${row.created_at}-${row.content}`);
          if (ids.current.has(key)) return;
          ids.current.add(key);
          setMessages((prev) => [...prev, row]);
          setStatus(null);
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
    try {
      const res = await trySend(token, text, replyTo, messageId);
      if ('closed' in res && res.closed) {
        applySession(res);
        setStatus(null);
      }
    } catch (err) {
      if (isGone(err)) setPhase('gone');
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setDraft(text);
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
    try {
      const res = await trySendMedia(token, file, caption, quoted, messageId);
      if ('closed' in res && res.closed) {
        applySession(res);
        setStatus(null);
        return;
      }
      if ('message' in res && res.message?.media_url) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...res.message!, id: messageId } : m)));
        URL.revokeObjectURL(localUrl);
      }
    } catch (err) {
      if (isGone(err)) setPhase('gone');
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      URL.revokeObjectURL(localUrl);
    }
  }

  async function sendVoice(blob: Blob) {
    const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' });
    await sendFile(file, '');
  }

  async function resetChat() {
    setMenu(false);
    try {
      applySession(await tryReset(token));
      setStatus(null);
    } catch (err) {
      if (isGone(err)) setPhase('gone');
    }
  }

  const agentName = session?.agent_name || 'שיחה';
  const locked = Boolean(session?.closed);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-center bg-[#07080c] text-white"
      style={{ height: height ?? '100dvh' }}
    >
      <div className="w-full max-w-[420px] h-full md:h-[min(100%,820px)] md:my-auto flex flex-col bg-[#0c0e14] md:rounded-[28px] md:overflow-hidden md:border md:border-white/[0.08] shadow-[0_0_80px_rgba(0,0,0,0.45)]">
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
          <>
            <header className="shrink-0 flex items-center gap-3 px-3 h-[60px] pt-[env(safe-area-inset-top)] bg-[#141821]/90 backdrop-blur-xl border-b border-white/[0.06]">
              <AgentAvatar name={agentName} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[16px] leading-tight truncate">{agentName}</div>
                <div className="text-[12px] h-4 text-white/50 truncate">
                  {status || (locked ? 'השיחה הסתיימה' : 'אונליין')}
                </div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu((v) => !v)}
                  className="w-9 h-9 rounded-full hover:bg-white/8 grid place-items-center"
                  aria-label="תפריט"
                >
                  <svg className="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
                {menu && (
                  <div className="absolute left-0 top-10 z-10 w-44 rounded-xl bg-[#1c2230] border border-white/10 shadow-xl py-1">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={resetChat}
                      className="w-full text-right px-3 py-2.5 text-sm hover:bg-white/5 disabled:opacity-40"
                    >
                      שיחה חדשה
                    </button>
                  </div>
                )}
              </div>
            </header>
            <Thread
              messages={messages}
              closedMessage={locked ? (session?.closed_message || GONE_COPY) : null}
              onReply={setReplyTo}
              viewportHeight={height}
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
            />
          </>
        )}
      </div>
    </div>
  );
}
