'use client';

import { useRef, useState } from 'react';
import type { TryBubble } from '@/lib/api/try';
import { dateLabel, formatTime } from './dates';

function visibleText(msg: TryBubble): string {
  const content = msg.content || '';
  if (msg.media_too_large) {
    return content.replace(/^\[קובץ גדול מדי\]:[^\n]*\n?/, '').trim();
  }
  if (msg.message_type === 'voice') {
    return content.replace(/^\[הודעה קולית\]:\s*/, '');
  }
  if ((msg.message_type === 'image' || msg.message_type === 'video') && msg.media_url) {
    const rest = content.replace(/^\[(image|video|תמונה|וידאו)\]:[^\n]*\n?/i, '').trim();
    if (rest === '[תמונה]' || rest === '[וידאו]') return '';
    return rest;
  }
  return content;
}

function replyPayload(msg: TryBubble): string {
  return visibleText(msg) || msg.content || '';
}

export function Bubble({
  msg,
  showDate,
  tailed,
  onReply,
  animate,
}: {
  msg: TryBubble;
  showDate: boolean;
  tailed: boolean;
  onReply: (text: string) => void;
  animate?: boolean;
}) {
  const mine = msg.role === 'user';
  const startX = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const kind = msg.message_type || 'text';
  const text = visibleText(msg);
  const label = dateLabel(msg.created_at);
  const replyHint = Math.min(1, Math.abs(drag) / 56);

  function reply() {
    const payload = replyPayload(msg);
    if (payload) onReply(payload);
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null) return;
    setDrag(Math.max(-72, Math.min(72, e.touches[0].clientX - startX.current)));
  }
  function onTouchEnd() {
    const moved = Math.abs(drag) > 56;
    startX.current = null;
    setDrag(0);
    if (moved) reply();
  }

  return (
    <div className={animate ? 'try-drop' : undefined}>
      {showDate && label && (
        <div className="flex justify-center mb-1">
          <span className="text-[11px] tracking-[0.16em] text-[color:var(--ink-faint)] px-3.5 py-1 rounded-full bg-[var(--glass)] border border-[var(--edge)]">
            {label}
          </span>
        </div>
      )}
      <div className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
        {!mine && (
          <span className="w-4 shrink-0 text-[color:var(--ink-dim)]" style={{ opacity: replyHint }} aria-hidden>
            <ReplyMark />
          </span>
        )}
        <div
          className={`try-bubble ${mine ? 'try-bubble-mine' : 'try-bubble-agent'}${tailed ? ' is-tailed' : ''}`}
          style={{ transform: `translateX(${drag}px)` }}
        >
          <span className="try-bubble-shine" />
          <button
            type="button"
            onDoubleClick={reply}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {msg.reply_to && (
              <div className="relative mb-1.5 pr-2 border-r border-white/20 text-[12px] leading-4 line-clamp-2 text-[color:var(--ink-dim)]">
                {msg.reply_to}
              </div>
            )}
            {msg.media_too_large && (
              <div className="relative text-[12px] text-[color:var(--ink-dim)] mb-1.5">קובץ גדול מדי, לא נשמר</div>
            )}
            {msg.media_url && kind === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={msg.media_url} alt="" className="relative rounded-[14px] max-h-56 max-w-full mb-1.5" />
            )}
            {msg.media_url && kind === 'video' && (
              <video src={msg.media_url} controls className="relative rounded-[14px] max-h-56 mb-1.5 max-w-full" preload="metadata" />
            )}
            {msg.media_url && kind === 'voice' && (
              <audio src={msg.media_url} controls preload="metadata" className="relative w-full max-w-[240px] h-10 mb-1.5" />
            )}
            {msg.media_url && kind === 'document' && (
              <a
                href={msg.media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block text-[13px] underline underline-offset-2 mb-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                פתח קובץ
              </a>
            )}
            {text && <div className="relative text-[15px] leading-[1.5] whitespace-pre-wrap break-words text-pretty">{text}</div>}
            {tailed && (
              <div className="relative mt-1.5 flex items-center gap-1 justify-start text-[10px] opacity-60">
                <span>{formatTime(msg.created_at)}</span>
                {mine && (
                  <svg width="14" height="9" viewBox="0 0 20 12" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 7l3.5 3.5L11 3" />
                    <path d="M8.5 7l3.5 3.5L19 3" />
                  </svg>
                )}
              </div>
            )}
          </button>
        </div>
        {mine && (
          <span className="w-4 shrink-0 text-[color:var(--ink-dim)]" style={{ opacity: replyHint }} aria-hidden>
            <ReplyMark />
          </span>
        )}
      </div>
    </div>
  );
}

function ReplyMark() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" />
    </svg>
  );
}
