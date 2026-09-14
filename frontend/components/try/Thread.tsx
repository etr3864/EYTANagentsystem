'use client';

import { useRef } from 'react';
import type { TryBubble } from '@/lib/api/try';
import { Bubble } from './Bubble';
import { isNewDay } from './dates';
import { TypingBubble } from './TypingBubble';
import { useStickToBottom } from './useStickToBottom';

export function Thread({
  messages,
  closedMessage,
  onReply,
  viewportHeight,
  typing,
  activity,
}: {
  messages: TryBubble[];
  closedMessage: string | null;
  onReply: (text: string) => void;
  viewportHeight?: number | null;
  typing?: boolean;
  activity?: string | null;
}) {
  const last = messages[messages.length - 1];
  const pinKey = `${last?.id ?? ''}:${viewportHeight ?? ''}:${typing ? 1 : 0}:${activity ?? ''}:${closedMessage ?? ''}`;
  const stick = useStickToBottom(pinKey, last ? String(last.id) : '', last?.role);
  const born = useRef<Set<string> | null>(null);
  if (born.current === null) {
    born.current = new Set(messages.map((m) => String(m.id)));
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={stick.scrollerRef}
        onScroll={stick.onScroll}
        onPointerDown={stick.onPointerDown}
        className="try-thread"
      >
        <div ref={stick.contentRef}>
          {messages.length === 0 && !closedMessage && (
            <div className="mt-20 text-center">
              <p className="text-[13px] text-white/30">התחל לכתוב</p>
              <p className="mt-1 text-[12px] text-white/20">הסוכן בצד השני</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const key = String(msg.id ?? `${msg.created_at || ''}-${i}`);
            const newDay = isNewDay(msg.created_at, prev?.created_at, !prev);
            const stacked = Boolean(prev && prev.role === msg.role && !newDay);
            const tailed = !next || next.role !== msg.role || isNewDay(next.created_at, msg.created_at, false);
            return (
              <div key={key} className={stacked ? 'mb-0.5' : 'mb-2.5'}>
                <Bubble
                  msg={msg}
                  showDate={newDay}
                  tailed={tailed}
                  onReply={onReply}
                  animate={!born.current!.has(String(msg.id))}
                />
              </div>
            );
          })}
          {typing && !closedMessage && (
            <div className="mb-2.5">
              <TypingBubble label={activity} />
            </div>
          )}
          {closedMessage && (
            <p className="text-center text-[13px] leading-6 text-white/45 max-w-[20rem] mx-auto my-5">
              {closedMessage}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        data-show={stick.showJump ? 'true' : 'false'}
        tabIndex={stick.showJump ? 0 : -1}
        aria-hidden={!stick.showJump}
        aria-label="להודעה האחרונה"
        onClick={stick.jumpToLatest}
        className="try-jump try-glass w-10 h-10 rounded-full grid place-items-center text-white/80"
      >
        <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </div>
  );
}
