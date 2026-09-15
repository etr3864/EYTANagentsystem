'use client';

import { useState } from 'react';
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
  const { scrollerRef, contentRef, showJump, onScroll, onPointerDown, jumpToLatest } = useStickToBottom(
    pinKey,
    last ? String(last.id) : '',
    last?.role,
  );
  const [initialIds] = useState(() => new Set(messages.map((m) => String(m.id))));

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        className="try-thread scrollbar-hide h-full"
      >
        <div ref={contentRef} className="flex flex-col gap-3">
          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const key = String(msg.id ?? `${msg.created_at || ''}-${i}`);
            const newDay = isNewDay(msg.created_at, prev?.created_at, !prev);
            const stacked = Boolean(prev && prev.role === msg.role && !newDay);
            const tailed = !next || next.role !== msg.role || isNewDay(next.created_at, msg.created_at, false);
            return (
              <div key={key} className={stacked ? '-mt-1.5' : undefined}>
                <Bubble
                  msg={msg}
                  showDate={newDay}
                  tailed={tailed}
                  onReply={onReply}
                  animate={!initialIds.has(String(msg.id))}
                />
              </div>
            );
          })}
          {typing && !closedMessage && <TypingBubble label={activity} />}
          {closedMessage && (
            <p className="text-center text-[13px] leading-6 text-[color:var(--ink-dim)] max-w-[20rem] mx-auto my-5">
              {closedMessage}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        data-show={showJump ? 'true' : 'false'}
        tabIndex={showJump ? 0 : -1}
        aria-hidden={!showJump}
        aria-label="להודעה האחרונה"
        onClick={jumpToLatest}
        className="try-jump try-icon"
      >
        <svg className="w-[17px] h-[17px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </div>
  );
}
