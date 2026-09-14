'use client';

import { useEffect, useRef } from 'react';
import type { TryBubble } from '@/lib/api/try';
import { Bubble } from './Bubble';
import { isNewDay } from './dates';
import { TypingBubble } from './TypingBubble';

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
  const ref = useRef<HTMLDivElement>(null);
  const born = useRef<Set<string> | null>(null);
  if (born.current === null) {
    born.current = new Set(messages.map((m) => String(m.id)));
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, closedMessage, viewportHeight, typing, activity]);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 try-chat-bg"
    >
      {messages.length === 0 && !closedMessage && (
        <p className="text-center text-white/40 text-sm mt-16">התחל לכתוב — הסוכן בצד השני</p>
      )}
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const key = String(msg.id ?? `${msg.created_at || ''}-${i}`);
        return (
          <div key={key} className="mb-1.5">
            <Bubble
              msg={msg}
              showDate={isNewDay(msg.created_at, prev?.created_at, !prev)}
              onReply={onReply}
              animate={!born.current!.has(String(msg.id))}
            />
          </div>
        );
      })}
      {typing && !closedMessage && <TypingBubble label={activity} />}
      {closedMessage && (
        <div className="flex justify-center my-4">
          <div className="max-w-[88%] rounded-2xl try-glass px-4 py-3 text-[13.5px] leading-6 text-white/80 text-center">
            {closedMessage}
          </div>
        </div>
      )}
    </div>
  );
}
