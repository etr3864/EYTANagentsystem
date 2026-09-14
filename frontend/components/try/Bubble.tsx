'use client';

import { useRef, useState } from 'react';
import type { TryBubble } from '@/lib/api/try';
import { BUBBLE_AGENT, BUBBLE_MINE, bubbleRadii } from './bubbleShape';
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
  onReply,
  animate,
}: {
  msg: TryBubble;
  showDate: boolean;
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
    const raw = e.touches[0].clientX - startX.current;
    setDrag(Math.max(-72, Math.min(72, raw)));
  }
  function onTouchEnd() {
    const moved = Math.abs(drag) > 56;
    startX.current = null;
    setDrag(0);
    if (moved) reply();
  }

  return (
    <div className={animate ? 'try-bubble-in' : undefined}>
      {showDate && label && (
        <div className="flex justify-center my-4">
          <span className="text-[11px] text-white/35">{label}</span>
        </div>
      )}
      <div className={`flex items-center gap-1.5 ${mine ? 'justify-end' : 'justify-start'} group`}>
        {!mine && (
          <span
            className="w-4 text-white/25 shrink-0 transition-opacity"
            style={{ opacity: 0.15 + replyHint * 0.7 }}
            aria-hidden
          >
            <ReplyMark />
          </span>
        )}
        <div
          className="relative max-w-[78%] transition-transform duration-150 ease-out"
          style={{
            color: mine ? BUBBLE_MINE : BUBBLE_AGENT,
            transform: `translateX(${drag}px)`,
          }}
        >
          <button
            type="button"
            onDoubleClick={reply}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              borderRadius: bubbleRadii(String(msg.id), mine),
              backgroundColor: mine ? BUBBLE_MINE : BUBBLE_AGENT,
            }}
            className="text-right px-3.5 py-2 text-[15px] leading-[1.45] text-white/[0.92]"
          >
          {msg.reply_to && (
            <div className="mb-1.5 pr-2 border-r-2 border-white/25 text-[12px] line-clamp-2 text-white/65">
              {msg.reply_to}
            </div>
          )}
          {msg.media_too_large && (
            <div className="text-[12px] opacity-80 mb-1.5">קובץ גדול מדי, לא נשמר</div>
          )}
          {msg.media_url && kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msg.media_url} alt="" className="rounded-2xl max-h-56 mb-1.5" />
          )}
          {msg.media_url && kind === 'video' && (
            <video src={msg.media_url} controls className="rounded-2xl max-h-56 mb-1.5 max-w-full" preload="metadata" />
          )}
          {msg.media_url && kind === 'voice' && (
            <audio src={msg.media_url} controls preload="metadata" className="w-full max-w-[240px] h-10 mb-1.5" />
          )}
          {msg.media_url && kind === 'document' && (
            <a
              href={msg.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[13px] underline underline-offset-2 mb-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              פתח קובץ
            </a>
          )}
          {text && (
            <div className="whitespace-pre-wrap break-words">{text}</div>
          )}
          <div className="mt-1 text-[10px] flex items-center gap-1 justify-end text-white/40">
            <span>{formatTime(msg.created_at)}</span>
            {mine && (
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 11" fill="none">
                <path d="M1 6.2l2.4 2.4L7.8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M6.2 6.2l2.4 2.4L14.2 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          </div>
          </button>
          <BubbleTail mine={mine} />
        </div>
        {mine && (
          <span
            className="w-4 text-white/25 shrink-0 transition-opacity"
            style={{ opacity: 0.15 + replyHint * 0.7 }}
            aria-hidden
          >
            <ReplyMark />
          </span>
        )}
      </div>
    </div>
  );
}

function BubbleTail({ mine }: { mine: boolean }) {
  if (mine) {
    return (
      <svg
        className="absolute bottom-0 left-0 -translate-x-[7px] w-[9px] h-[13px] pointer-events-none"
        viewBox="0 0 9 13"
        aria-hidden
      >
        <path fill="currentColor" d="M9 0C6.2 6.5 2.8 11.2 0 13h9V0z" />
      </svg>
    );
  }
  return (
    <svg
      className="absolute bottom-0 right-0 translate-x-[7px] w-[9px] h-[13px] pointer-events-none"
      viewBox="0 0 9 13"
      aria-hidden
    >
      <path fill="currentColor" d="M0 0c2.8 6.5 6.2 11.2 9 13H0V0z" />
    </svg>
  );
}

function ReplyMark() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" />
    </svg>
  );
}
