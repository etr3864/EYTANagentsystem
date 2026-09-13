'use client';

import { useRef } from 'react';
import type { TryBubble } from '@/lib/api/try';

function formatTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'היום';
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

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
}: {
  msg: TryBubble;
  showDate: boolean;
  onReply: (text: string) => void;
}) {
  const mine = msg.role === 'user';
  const startX = useRef<number | null>(null);
  const kind = msg.message_type || 'text';
  const text = visibleText(msg);

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    const payload = replyPayload(msg);
    if (Math.abs(dx) > 56 && payload) onReply(payload);
  }

  return (
    <div>
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="text-[11px] text-white/45 bg-black/25 px-3 py-1 rounded-full">
            {dateLabel(msg.created_at)}
          </span>
        </div>
      )}
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'} group`}>
        <button
          type="button"
          onDoubleClick={() => {
            const payload = replyPayload(msg);
            if (payload) onReply(payload);
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className={`
            max-w-[78%] text-right px-3.5 py-2 rounded-[18px] text-[15px] leading-[1.45]
            ${mine
              ? 'bg-[#1f8a70] text-white rounded-bl-md'
              : 'bg-[#1c2230] text-[#f3f5f8] rounded-br-md'}
          `}
        >
          {msg.reply_to && (
            <div className={`mb-1.5 pr-2 border-r-2 text-[12px] opacity-80 line-clamp-2 ${mine ? 'border-white/40' : 'border-teal-400/50'}`}>
              {msg.reply_to}
            </div>
          )}
          {msg.media_too_large && (
            <div className="text-[12px] opacity-80 mb-1.5">קובץ גדול מדי — לא נשמר</div>
          )}
          {msg.media_url && kind === 'image' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msg.media_url} alt="" className="rounded-xl max-h-56 mb-1.5" />
          )}
          {msg.media_url && kind === 'video' && (
            <video src={msg.media_url} controls className="rounded-xl max-h-56 mb-1.5 max-w-full" preload="metadata" />
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
          <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-white/35'} flex items-center gap-1 justify-end`}>
            <span>{formatTime(msg.created_at)}</span>
            {mine && (
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 11" fill="none">
                <path d="M1 6.2l2.4 2.4L7.8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M6.2 6.2l2.4 2.4L14.2 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
